import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { leadIntakeSchema } from '@/lib/validation';
import { recordAudit } from '@/lib/audit';
import { nextReference } from '@/server/reference';
import { normalizeCountry, normalizeEmail, normalizePhone, toTitleCase } from '@/lib/normalize';
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.LEAD_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const allowOrigin = origin && (allowed.length === 0 || allowed.includes(origin)) ? origin : allowed[0] ?? '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-rf-token',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  const expectedToken = process.env.LEAD_INTAKE_TOKEN;
  if (expectedToken && request.headers.get('x-rf-token') !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401, headers });
  }

  pruneRateLimits();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = rateLimit(`lead:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again shortly.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfter) } },
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

  return NextResponse.json({ ok: true, reference: client.reference }, { status: 201, headers });
}
