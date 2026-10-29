import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadIntakeSchema } from '@/lib/validation';
import { auditRow } from '@/lib/audit';
import { nextReference } from '@/server/reference';
import { normalizeCountry, normalizeEmail, normalizePhone, toTitleCase } from '@/lib/normalize';
import { pruneRateLimits, rateLimitSafe } from '@/lib/rate-limit';
import { clientIpFrom, safeEqual } from '@/lib/client-ip';
import { Prisma } from '@prisma/client';
import { newPublicReference } from '@/lib/public-reference';
import { sendLeadNotification } from '@/lib/lead-notification';
import { afterResponse } from '@/lib/after-response';

export const dynamic = 'force-dynamic';

/**
 * Only origins named in LEAD_ALLOWED_ORIGINS are echoed back. An unconfigured or
 * unmatched origin gets no CORS header at all rather than a wildcard.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.LEAD_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const base: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-rf-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin && allowed.includes(origin)) {
    return { ...base, 'Access-Control-Allow-Origin': origin };
  }
  return base;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  // Fail closed: an unset token disables the endpoint rather than opening it.
  const expectedToken = process.env.LEAD_INTAKE_TOKEN?.trim();
  if (!expectedToken) {
    console.error('Lead intake rejected: LEAD_INTAKE_TOKEN is not configured.');
    return NextResponse.json({ error: 'Lead intake is not configured.' }, { status: 503, headers });
  }
  if (!safeEqual(request.headers.get('x-rf-token'), expectedToken)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers });
  }

  // Pruning on roughly one request in fifty keeps the table small without
  // adding a delete to every submission.
  if (Math.random() < 0.02) await pruneRateLimits().catch(() => undefined);

  // No per-caller key is fully reliable behind a proxy pool, so the global
  // bucket is the real ceiling: it is keyed on nothing the caller can
  // influence. Thirty a minute is far above anything this practice sees and
  // still bounds a flood.
  const ip = clientIpFrom(request.headers);
  const [perIp, global] = await Promise.all([
    rateLimitSafe(`lead:ip:${ip}`, 10, 60_000),
    rateLimitSafe('lead:global', 30, 60_000),
  ]);
  if (!perIp.allowed || !global.allowed) {
    const retryAfter = Math.max(perIp.retryAfter, global.retryAfter);
    return NextResponse.json(
      { error: 'Too many submissions. Try again shortly.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400, headers });
  }

  // Honeypot: real visitors never fill this in.
  if (typeof payload === 'object' && payload !== null && 'company_website' in payload) {
    const trap = (payload as Record<string, unknown>).company_website;
    if (typeof trap === 'string' && trap.trim() !== '') {
      return NextResponse.json({ ok: true }, { status: 202, headers });
    }
  }

  const parsed = leadIntakeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Check the submitted fields.', issues: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 422, headers },
    );
  }

  const input = parsed.data;
  const gclid = input.gclid?.trim() || null;
  const adCampaignId = input.adCampaignId?.trim() || null;
  const email = normalizeEmail(input.email ?? null);
  const { phone } = normalizePhone(input.phone ?? null);

  // Spec: source is set to Google Ads automatically whenever a GCLID is present.
  const source = gclid
    ? 'GOOGLE_ADS'
    : input.utmSource?.toLowerCase().includes('linkedin')
      ? 'LINKEDIN'
      : 'WEBSITE';

  const notes = input.message ? `Website enquiry:\n\n${input.message}` : null;

  // A double submit, a back-button resubmit or a second enquiry from the same
  // person should enrich the existing record, not create a duplicate one.
  const existing = email
    ? await prisma.client.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, gclid: true, notes: true, publicReference: true },
      })
    : null;

  if (existing) {
    // Rows that predate public references, and every CRM-created client, have
    // none. Mint one now so a returning visitor still gets a handle back.
    const publicReference = existing.publicReference ?? newPublicReference();

    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: existing.id },
        data: {
          // Latest attribution wins; earlier values are kept when this
          // submission carries none.
          gclid: gclid ?? existing.gclid,
          adCampaignId: adCampaignId ?? undefined,
          utmSource: input.utmSource ?? undefined,
          utmMedium: input.utmMedium ?? undefined,
          utmCampaign: input.utmCampaign ?? undefined,
          keyword: input.keyword ?? undefined,
          landingPage: input.landingPage ?? undefined,
          phone: phone ?? undefined,
          publicReference,
          preferredContactMethod: input.preferredContactMethod ?? undefined,
          readiness: input.readiness ?? undefined,
          enquiryIntent: input.enquiryIntent ?? undefined,
          // Consent is only ever turned on by an explicit tick, never off.
          ...(input.marketingConsent === true ? { marketingConsent: true } : {}),
          ...(input.consultationConsent === true ? { consultationConsentAt: new Date() } : {}),
          notes: notes ? [existing.notes, notes].filter(Boolean).join('\n\n---\n\n') : undefined,
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: auditRow({
          entity: 'Client',
          entityId: existing.id,
          action: 'updated',
          actorLabel: 'Website form',
          summary: 'Repeat website enquiry merged into the existing record',
        }),
      });
    });

    notify({
      clientId: existing.id,
      publicReference,
      repeat: true,
      fullName: toTitleCase(input.fullName),
      email,
      phone,
      countryOfResidence: normalizeCountry(input.countryOfResidence ?? null),
      preferredContactMethod: input.preferredContactMethod ?? null,
      readiness: input.readiness ?? null,
      enquiryIntent: input.enquiryIntent ?? null,
      source,
      landingPage: input.landingPage ?? null,
      message: input.message ?? null,
    });

    return NextResponse.json({ ok: true, reference: publicReference }, { status: 200, headers });
  }

  let client: { id: string; reference: string; fullName: string; publicReference: string | null } | null = null;
  for (let attempt = 0; attempt < 5 && !client; attempt += 1) {
    try {
      // The client and its conversion event are written together: a failure
      // after the client lands would otherwise leave the visitor retrying and
      // creating duplicates.
      client = await prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            reference: await nextReference(),
            publicReference: newPublicReference(),
            fullName: toTitleCase(input.fullName),
            email,
            phone,
            countryOfResidence: normalizeCountry(input.countryOfResidence ?? null),
            countryOfBirth: normalizeCountry(input.countryOfBirth ?? null),
            source,
            sourceRaw: input.sourceRaw ?? input.utmSource ?? 'website-form',
            status: 'PROSPECT',
            marketingConsent: input.marketingConsent === true,
            consultationConsentAt: input.consultationConsent === true ? new Date() : null,
            preferredContactMethod: input.preferredContactMethod ?? null,
            readiness: input.readiness ?? null,
            enquiryIntent: input.enquiryIntent ?? null,
            notes,
            gclid,
            adCampaignId,
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            keyword: input.keyword ?? null,
            landingPage: input.landingPage ?? null,
            leadDate: new Date(),
          },
          select: { id: true, reference: true, fullName: true, publicReference: true },
        });

        // The Lead conversion is queued only when a click id exists.
        await tx.conversionEvent.create({
          data: {
            clientId: created.id,
            type: 'LEAD',
            gclid,
            status: gclid ? 'PENDING' : 'SKIPPED',
          },
        });

        await tx.auditLog.create({
          data: auditRow({
            entity: 'Client',
            entityId: created.id,
            action: 'created',
            actorLabel: 'Website form',
            summary: `Website enquiry created ${created.fullName} (${created.reference})`,
          }),
        });

        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }

  if (!client) {
    return NextResponse.json({ error: 'Could not record the enquiry.' }, { status: 500, headers });
  }

  notify({
    clientId: client.id,
    // Set on create, so it is never null here. The fallback only satisfies the
    // type, since `select` cannot express that.
    publicReference: client.publicReference ?? '',
    repeat: false,
    fullName: client.fullName,
    email,
    phone,
    countryOfResidence: normalizeCountry(input.countryOfResidence ?? null),
    preferredContactMethod: input.preferredContactMethod ?? null,
    readiness: input.readiness ?? null,
    enquiryIntent: input.enquiryIntent ?? null,
    source,
    landingPage: input.landingPage ?? null,
    message: input.message ?? null,
  });

  // `reference` is sequential, so it never leaves the CRM. `publicReference`
  // is random and carries no information about how many clients exist.
  return NextResponse.json({ ok: true, reference: client.publicReference }, { status: 201, headers });
}

/**
 * Send the alert once the response is on its way. An enquiry is already
 * durable by this point, so a slow or broken mail provider must not keep the
 * visitor waiting or turn their successful submission into an error.
 */
function notify(lead: Parameters<typeof sendLeadNotification>[0]) {
  afterResponse(async () => {
    const result = await sendLeadNotification(lead);
    if (!result.sent && !result.skipped) {
      console.error(`Lead notification not sent for ${lead.publicReference}: ${result.reason}`);
    }
  });
}
