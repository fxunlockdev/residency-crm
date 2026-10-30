import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { CONSENT_TEXTS, updateSubscriptionSchema } from '@/lib/validation';
import { normalizeEmail, normalizePhone } from '@/lib/normalize';
import { pruneRateLimits, rateLimitSafe } from '@/lib/rate-limit';
import { clientIpFrom, safeEqual } from '@/lib/client-ip';
import { sendSubscriptionNotification } from '@/lib/lead-notification';
import { syncSubscriber } from '@/lib/mailerlite';
import { afterResponse } from '@/lib/after-response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Fail closed, exactly as the lead endpoint does: an unset token disables
  // this rather than opening it.
  const expectedToken = process.env.LEAD_INTAKE_TOKEN?.trim();
  if (!expectedToken) {
    console.error('Updates signup rejected: LEAD_INTAKE_TOKEN is not configured.');
    return NextResponse.json({ error: 'Signups are not configured.' }, { status: 503 });
  }
  if (!safeEqual(request.headers.get('x-rf-token'), expectedToken)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  if (Math.random() < 0.02) await pruneRateLimits().catch(() => undefined);

  const ip = clientIpFrom(request.headers);
  const [perIp, global] = await Promise.all([
    rateLimitSafe(`updates:ip:${ip}`, 5, 60_000),
    rateLimitSafe('updates:global', 30, 60_000),
  ]);
  if (!perIp.allowed || !global.allowed) {
    const retryAfter = Math.max(perIp.retryAfter, global.retryAfter);
    return NextResponse.json(
      { error: 'Too many signups. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = updateSubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the submitted fields.', issues: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 422 },
    );
  }

  const input = parsed.data;
  const email = normalizeEmail(input.email ?? null);
  const { phone } = normalizePhone(input.phone ?? null);

  // The browser sends its own consent_timestamp, but a consent record is only
  // worth keeping if it cannot be forged, so the server's receipt time is what
  // gets stored. The two are seconds apart.
  const consentAt = new Date();

  const existing = await prisma.updateSubscription.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
    select: {
      id: true,
      email: true,
      phone: true,
      consentWhatsapp: true,
      consentEmail: true,
      unsubscribedAt: true,
    },
  });

  // Somebody who has opted out stays opted out. This form is unauthenticated,
  // so a signup here is not proof that the person it names asked for anything,
  // and silently resurrecting them would be the one thing an unsubscribe is
  // supposed to prevent. The request is accepted and recorded; re-enabling is
  // a deliberate act in the CRM.
  if (existing?.unsubscribedAt) {
    console.warn(`Updates signup for ${existing.id}, which has unsubscribed. Left opted out.`);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const subscription = existing
    ? await prisma.updateSubscription.update({
        where: { id: existing.id },
        data: {
          name: input.name || undefined,
          // Fill a blank, never replace a detail already on the row. Matching
          // is by email OR phone, so a shared number would otherwise let one
          // signup overwrite another person's address.
          email: existing.email ?? email,
          phone: existing.phone ?? phone,
          // Channels are only ever turned on here. Opting out happens through
          // the unsubscribe link, never through a signup form.
          consentWhatsapp: existing.consentWhatsapp || input.consentWhatsapp,
          consentEmail: existing.consentEmail || input.consentEmail,
          consentAt,
          consentVersion: input.consentVersion,
          consentText: CONSENT_TEXTS[input.consentVersion],
          signupType: input.signupType,
          sourcePath: input.sourcePath ?? undefined,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          consentEmail: true,
          consentWhatsapp: true,
          sourcePath: true,
        },
      })
    : await prisma.updateSubscription.create({
        data: {
          name: input.name || null,
          email,
          phone,
          consentWhatsapp: input.consentWhatsapp,
          consentEmail: input.consentEmail,
          consentAt,
          consentVersion: input.consentVersion,
          // Our copy of the wording, not the caller's.
          consentText: CONSENT_TEXTS[input.consentVersion]!,
          signupType: input.signupType,
          sourcePath: input.sourcePath ?? null,
          unsubscribeToken: randomBytes(24).toString('base64url'),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          consentEmail: true,
          consentWhatsapp: true,
          sourcePath: true,
        },
      });

  afterResponse(async () => {
    // The row is already committed, so both of these are best effort. The
    // MailerLite outcome is written back so a failed sync is visible in the
    // CRM rather than quietly losing a subscriber.
    const [notification, sync] = await Promise.all([
      sendSubscriptionNotification({
        name: subscription.name,
        email: subscription.email ?? subscription.phone ?? 'no contact detail',
        consentEmail: subscription.consentEmail,
        consentWhatsapp: subscription.consentWhatsapp,
        sourcePath: subscription.sourcePath,
      }),
      syncSubscriber({
        email: subscription.email,
        phone: subscription.phone,
        name: subscription.name,
        consentEmail: subscription.consentEmail,
        consentWhatsapp: subscription.consentWhatsapp,
        consentAt,
      }),
    ]);

    if (!notification.sent) {
      const message = `Subscription alert not sent for ${subscription.id}: ${notification.reason}`;
      if (notification.skipped) console.warn(message);
      else console.error(message);
    }

    await prisma.updateSubscription
      .update({
        where: { id: subscription.id },
        data: {
          // Only ever set on success. Writing null on a later transient
          // failure would erase a timestamp that was true, and claim the
          // subscriber was never synced when they were.
          ...(sync.synced ? { mailerliteSyncedAt: new Date() } : {}),
          // A skip is not a failure: MailerLite may simply not be configured,
          // or this may be a WhatsApp-only subscriber with no email to sync.
          // Recording those as errors would make the settings page cry wolf.
          mailerliteError: sync.synced || sync.skipped ? null : (sync.reason ?? null),
        },
      })
      .catch((error: unknown) => {
        console.error(`Could not record the MailerLite sync for ${subscription.id}:`, error);
      });

    if (!sync.synced && !sync.skipped) {
      console.error(`MailerLite sync failed for ${subscription.id}: ${sync.reason}`);
    }
  });

  // The browser checks for `ok === true` and nothing else.
  return NextResponse.json({ ok: true }, { status: existing ? 200 : 201 });
}
