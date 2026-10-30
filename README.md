# Residency First — EB-5 Client & Commission Tracker

Tracks every Residency First EB-5 prospect and client from the first Google Ads click
through to I-829 approval and commission paid.

Built to the 9 October 2026 developer spec: Clients, Meetings and Commissions, with
Google Ads lead attribution, the five launch views and an audit trail of status changes.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript |
| Data | PostgreSQL via Prisma |
| Auth | In-app email + password, invite-only, three roles |
| Files | Private volume, served only through an authenticated route |
| Hosting | Railway (Docker) |

Money is stored as integer US cents throughout. Dates are stored at UTC midnight so a
calendar day never shifts across timezones.

## Running locally

```bash
npm install
cp .env.example .env            # then fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate deploy
npx tsx scripts/create-admin.ts --email you@example.com --name "Your Name"
npm run dev
```

A throwaway Postgres for development:

```bash
docker run -d --name rf-crm-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_USER=rf \
  -e POSTGRES_DB=rfcrm -p 55432:5432 postgres:16-alpine
```

## Importing the legacy Zoho export

The export holds client PII and is **never committed**. Supply it at run time:

```bash
npx tsx scripts/import-zoho.ts --file "/path/to/ZOHO FINAL.csv" --dry-run   # inspect first
npx tsx scripts/import-zoho.ts --file "/path/to/ZOHO FINAL.csv" --reset     # then load
```

The importer:

- reads the file as Windows-1252, which is how it was produced;
- title-cases shouting surnames, expands `UK`/`HK`/`Dubai`, normalises `Eb-5 Capital`
  and lower-cased proper nouns, and splits packed phone numbers;
- maps `I-526 Filed` / `I-526 Approved` onto the pipeline, and treats a person's name in
  the Source column as a referral while keeping the original string;
- splits a staged `Res Invest Fee` across its funding and filing instalments without
  losing a cent (`--no-split-fee` keeps it whole);
- preserves every legacy column on the client record as read-only history;
- prints a reconciliation report and re-reads the database to prove the totals.

Against the 145-row export it produces 145 clients, 179 commissions, 17 projects and
3 regional centres, totalling $3,427,000 of commission with $2,817,000 received —
matching the source file exactly.

## Website lead capture

Add to every page of the marketing site:

```html
<script src="https://crm.residencyfirst.com/rf-lead.js"
        data-endpoint="https://crm.residencyfirst.com/api/leads/intake"
        data-token="YOUR_LEAD_INTAKE_TOKEN"
        data-form="#enquiry-form" defer></script>
```

It stores the GCLID and UTM parameters in a first-party cookie for 90 days, and only
writes that cookie once Google Consent Mode v2 reports `analytics_storage` as granted.
A record that arrives with a GCLID is marked Google Ads automatically.

## The website's news section

Articles written here appear on the public marketing site at
`residencyfirst.com/insights/`, alongside the five that shipped with the
design.

| Where | What |
|---|---|
| **News & insights** | Write, preview and publish. A draft is invisible to the public; publishing is a separate, deliberate action from saving |
| `GET /api/public/articles` | The published list, for the website |
| `GET /api/public/articles/<slug>` | One article, with its rendered body |

Both endpoints require `x-rf-token: $LEAD_INTAKE_TOKEN`, the same shared
secret the website already uses to post enquiries.

The markdown is rendered to HTML **here**, on save, with marked and a
sanitize-html allowlist matching the design's own vocabulary, and stored in
`Article.bodyHtml`. The website inserts that HTML verbatim and never parses
author input. A hero image is picked from four the design already ships, with
the alt text and caption they are already published with, so an article
cannot introduce artwork the site never had.

A published slug cannot change: it is already in links, bookmarks and search
results. The five slugs the package ships are reserved, because a static file
on the website always wins and an article filed under one would look
published here and be invisible to a reader.

## The EB-5 updates list

The signup on the website writes straight into **Updates list**. A subscriber
chooses WhatsApp, email or both, so either contact detail may be absent and
the two channels are counted and filtered separately.

- **Updates list** shows everyone, filterable by channel and status, with the
  consent wording each person agreed to and when.
- **Export CSV** gives the filtered segment as a spreadsheet. Until the CRM
  can send WhatsApp itself, this is how a WhatsApp broadcast gets its
  recipients. The download is signed in and logged.
- **Newsletter** writes and sends to the email segment through Resend's batch
  endpoint, a hundred separately addressed messages per call, each carrying
  that subscriber's own unsubscribe link and the RFC 8058 headers Gmail and
  Outlook expect.

An unsubscribe is recorded here, not at the provider: two copies of a consent
record is two answers to "did they unsubscribe", and the wrong one eventually
wins. `POST /api/updates/unsubscribe` takes the token and answers the same way
whether or not it matched, so it cannot be used to guess another subscriber's.

A sent newsletter is kept as a record of what subscribers were told, and
cannot be edited or deleted.

## Mail

Everything goes out through Resend.

| Variable | Used for |
|---|---|
| `RESEND_API_KEY` | All mail. Without it nothing is sent and the reason is logged, rather than a failure being reported as a success |
| `ALERT_EMAIL_FROM` | The sending address, on a domain verified at Resend |
| `ALERT_EMAIL_TO` | The daily digest. Comma-separated, up to fifty |
| `LEAD_NOTIFY_TO` | Enquiry alerts. Falls back to `ALERT_EMAIL_TO` |
| `PUBLIC_SITE_URL` | Where unsubscribe links point. Defaults to `https://www.residencyfirst.com` |

## Scheduled jobs

| Path | Purpose |
|---|---|
| `GET /api/cron/google-ads` | Uploads queued Lead / Engaged / Funded conversions by GCLID |
| `GET /api/cron/google-ads-spend` | Pulls per-campaign spend, clicks and impressions (re-pulls a 14-day trailing window, since Google restates recent figures) |
| `GET /api/cron/digest` | Daily digest of follow-ups, commissions due and overdue invoices |
| `GET /api/health` | Railway healthcheck |

Both cron routes accept `Authorization: Bearer $CRON_SECRET`, or an admin session.

## Deployment

Railway builds the Dockerfile and runs `prisma migrate deploy` before starting. Attach a
Postgres service and a volume mounted at the path in `UPLOAD_DIR`. Required variables are
listed in `.env.example`.

## Tests

```bash
npm test          # unit and integration tests
npm run typecheck
npm run build
```

Integration tests under `tests/integration/` talk to the database in
`DATABASE_URL`, so point that at a throwaway Postgres rather than anything real.
They cover the things a mock cannot prove: the atomic rate-limit counter, and the
optimistic-locking guard that stops two advisors silently overwriting each other.

## Google Ads reporting

`/google-ads` puts spend next to investors won. Two things make it work:

- **The join key.** A GCLID identifies a click, not a campaign, so the Google
  Ads final URL suffix must include `campaignid={campaignid}`. The lead snippet
  stores it, and spend joins on the numeric id rather than the campaign name,
  which changes whenever somebody renames a campaign.
- **Cohorting by lead month.** An EB-5 deal takes months to close, so comparing
  this month's spend with this month's funded investors divides one month's cost
  by another month's outcome. Every figure is grouped by the month the lead
  arrived, and cohorts younger than the typical sales cycle are marked as still
  maturing rather than shown as failures.

Cost arrives from Google as micros and is rounded to integer cents on ingest, so
it sits alongside every other amount. If the Ads account does not bill in USD
the page says so, because commissions are USD and the two must not be silently
compared.

## Concurrency

`Client.version` is incremented on every write and submitted as a hidden field by
the edit form. A save carrying a stale version matches no row and is rejected with
a message, rather than reverting the other person's work across every field. The
record update and its audit rows are written in one transaction, so a change can
never land without a trace of who made it.

## Data rules

- No passports, identity documents, source-of-funds evidence or bank details. The
  attorney holds those.
- Uploads are private: every download goes through an authenticated route. Access
  is flat by design — any signed-in user may open any document, matching the fact
  that a read-only Viewer already sees every client record and commission. Revisit
  this before issuing a Viewer login to anyone outside the core team.
- Status changes are written to an audit log with actor and timestamp.
- Marketing consent is per client and off by default for every migrated record.
