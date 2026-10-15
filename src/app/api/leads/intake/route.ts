import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadIntakeSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import { nextReference } from '@/server/reference';
import { normalizeCountry, normalizeEmail, normalizePhone, toTitleCase } from '@/lib/normalize';
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit';
import { clientIpFrom, safeEqual } from '@/lib/client-ip';
import { Prisma } from '@prisma/client';

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

  pruneRateLimits();
  // X-Forwarded-For is client-writable, so the per-IP bucket alone can be rotated
  // away. A global bucket keyed on nothing the caller controls is the real ceiling.
  const ip = clientIpFrom(request.headers);
  const perIp = rateLimit(`lead:ip:${ip}`, 10, 60_000);
  const global = rateLimit('lead:global', 120, 60_000);
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
  const email = normalizeEmail(input.email ?? null);
  const { phone } = normalizePhone(input.phone ?? null);

  // Spec: source is set to Google Ads automatically whenever a GCLID is present.
  const source = gclid
    ? 'GOOGLE_ADS'
    : input.utmSource?.toLowerCase().includes('linkedin')
      ? 'LINKEDIN'
      : 'WEBSITE';

  const notes = input.message ? `Website enquiry:\n\n${input.message}` : null;

  let client: { id: string; reference: string; fullName: string } | null = null;
  for (let attempt = 0; attempt < 5 && !client; attempt += 1) {
    try {
      client = await prisma.client.create({
        data: {
          reference: await nextReference(),
          fullName: toTitleCase(input.fullName),
          email,
          phone,
          countryOfResidence: normalizeCountry(input.countryOfResidence ?? null),
          countryOfBirth: normalizeCountry(input.countryOfBirth ?? null),
          source,
          sourceRaw: input.utmSource ?? 'website-form',
          status: 'PROSPECT',
          marketingConsent: input.marketingConsent === true,
          notes,
          gclid,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          keyword: input.keyword ?? null,
          landingPage: input.landingPage ?? null,
          leadDate: new Date(),
        },
        select: { id: true, reference: true, fullName: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }

  if (!client) {
    return NextResponse.json({ error: 'Could not record the enquiry.' }, { status: 500, headers });
  }

  // The Lead conversion is the online one; it is queued only when a click id exists.
  await prisma.conversionEvent.create({
    data: {
      clientId: client.id,
      type: 'LEAD',
      gclid,
      status: gclid ? 'PENDING' : 'SKIPPED',
    },
  });

  await recordAudit({
    entity: 'Client',
    entityId: client.id,
    action: 'created',
    actorLabel: 'Website form',
    summary: `Website enquiry created ${client.fullName} (${client.reference})`,
  });

  // The reference is sequential, so returning it would leak the size of the book.
  return NextResponse.json({ ok: true }, { status: 201, headers });
}
