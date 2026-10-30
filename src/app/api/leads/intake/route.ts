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

/**
 * The client edit form refuses notes longer than this, so letting the public
 * endpoint grow the field past it would lock staff out of saving the record.
 */
const NOTES_LIMIT = 8000;

/** One line for staff when a submission contradicts what we already hold. */
function conflict(label: string, stored: string | null, submitted: string | null): string | null {
  if (!submitted || !stored) return null;
  if (stored.trim().toLowerCase() === submitted.trim().toLowerCase()) return null;
  return `  ${label}: submitted ${submitted}, on record ${stored}`;
}

/**
 * Append, newest last, and stop at the limit rather than truncating a record
 * staff may be relying on. Repeated submissions cannot grow this without
 * bound.
 */
function appendNote(current: string | null, addition: string): string | undefined {
  if (!addition) return undefined;
  if (!current) return addition.slice(0, NOTES_LIMIT);

  const combined = `${current}\n\n---\n\n${addition}`;
  if (combined.length <= NOTES_LIMIT) return combined;

  // Out of room. Leave what is there and say so once, if even that fits.
  const marker = '\n\n---\n\n[Further website enquiries not appended: the notes are full.]';
  if (current.endsWith(marker)) return undefined;
  if (current.length + marker.length > NOTES_LIMIT) return undefined;
  return current + marker;
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
  //
  // It must not do more than that. This endpoint is unauthenticated, and the
  // only thing a caller needs to reach an existing client is their email
  // address. If a submission could overwrite stored details, anyone who knows
  // an investor's email could replace their phone number with their own and
  // wait for staff to call it. So a repeat enquiry fills blanks and appends a
  // note; it never changes a value a person already put there.
  const existing = email
    ? await prisma.client.findFirst({
        where: { email },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          gclid: true,
          adCampaignId: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          keyword: true,
          landingPage: true,
          phone: true,
          countryOfResidence: true,
          preferredContactMethod: true,
          readiness: true,
          enquiryIntent: true,
          consultationConsentAt: true,
          publicReference: true,
        },
      })
    : null;

  if (existing) {
    const country = normalizeCountry(input.countryOfResidence ?? null);

    // Anything the visitor sent that contradicts what we hold goes to staff as
    // text to check, rather than silently replacing the real value.
    const conflicts = [
      conflict('Phone', existing.phone, phone),
      conflict('Country', existing.countryOfResidence, country),
      conflict('Preferred contact', existing.preferredContactMethod, input.preferredContactMethod ?? null),
      conflict('Timeline', existing.readiness, input.readiness ?? null),
    ].filter((line): line is string => line !== null);

    const body = [
      input.message ? `Website enquiry:\n\n${input.message}` : 'Website enquiry with no message.',
      conflicts.length > 0
        ? `Submitted details that differ from the record, unverified:\n${conflicts.join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const publicReference = existing.publicReference ?? newPublicReference();

    await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction and append there. Reading notes outside
      // it let a concurrent enquiry, or a staff edit, be overwritten.
      const current = await tx.client.findUniqueOrThrow({
        where: { id: existing.id },
        select: { notes: true, publicReference: true },
      });

      await tx.client.update({
        where: { id: existing.id },
        data: {
          // Blanks only. `??` on the stored value means a present value wins.
          gclid: existing.gclid ?? gclid,
          adCampaignId: existing.adCampaignId ?? adCampaignId,
          utmSource: existing.utmSource ?? input.utmSource ?? null,
          utmMedium: existing.utmMedium ?? input.utmMedium ?? null,
          utmCampaign: existing.utmCampaign ?? input.utmCampaign ?? null,
          keyword: existing.keyword ?? input.keyword ?? null,
          landingPage: existing.landingPage ?? input.landingPage ?? null,
          phone: existing.phone ?? phone,
          countryOfResidence: existing.countryOfResidence ?? country,
          preferredContactMethod: existing.preferredContactMethod ?? input.preferredContactMethod ?? null,
          readiness: existing.readiness ?? input.readiness ?? null,
          enquiryIntent: existing.enquiryIntent ?? input.enquiryIntent ?? null,
          // Whoever asked first keeps the handle they were given.
          publicReference: current.publicReference ?? publicReference,
          // Consent is only ever turned on by an explicit tick, never off, and
          // the first time it was given is the record worth keeping.
          ...(input.marketingConsent === true ? { marketingConsent: true } : {}),
          ...(input.consultationConsent === true && !existing.consultationConsentAt
            ? { consultationConsentAt: new Date() }
            : {}),
          notes: appendNote(current.notes, body),
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: auditRow({
          entity: 'Client',
          entityId: existing.id,
          action: 'updated',
          actorLabel: 'Website form',
          summary:
            conflicts.length > 0
              ? 'Repeat website enquiry merged, with submitted details that differ from the record'
              : 'Repeat website enquiry merged into the existing record',
        }),
      });
    });

    notify({
      clientId: existing.id,
      publicReference: existing.publicReference ?? publicReference,
      repeat: true,
      fullName: toTitleCase(input.fullName),
      email,
      phone,
      countryOfResidence: country,
      preferredContactMethod: input.preferredContactMethod ?? null,
      readiness: input.readiness ?? null,
      enquiryIntent: input.enquiryIntent ?? null,
      source,
      landingPage: input.landingPage ?? null,
      message: input.message ?? null,
    });

    return NextResponse.json(
      { ok: true, reference: existing.publicReference ?? publicReference },
      { status: 200, headers },
    );
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
    if (!result.sent) {
      const message = `Enquiry alert not sent for ${lead.publicReference}: ${result.reason}`;
      // A skip means mail is switched off, which is a configuration problem
      // worth surfacing: the enquiry is stored, but nobody is told about it.
      if (result.skipped) console.warn(message);
      else console.error(message);
    }
  });
}
