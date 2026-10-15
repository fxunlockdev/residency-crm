import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { UserForm } from '@/components/settings/user-form';
import { CodeBlock } from '@/components/settings/snippet';
import { Alert } from '@/components/ui/alert';
import { getDataQuality } from '@/lib/queries/data-quality';
import { ROLE_LABEL } from '@/lib/labels';
import { formatDate } from '@/lib/dates';
import { isAdsConfigured } from '@/lib/google-ads';
import { toggleUserAction, createReferenceAction } from '@/server/user-actions';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const actor = await requireRole('ADMIN');

  const [users, centres, projects, quality, conversionCounts] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
    prisma.regionalCentre.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { clients: true } } } }),
    prisma.project.findMany({
      orderBy: { name: 'asc' },
      include: { regionalCentre: { select: { name: true } }, _count: { select: { clients: true } } },
    }),
    getDataQuality(),
    prisma.conversionEvent.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const appUrl = process.env.APP_URL ?? 'https://crm.residencyfirst.com';
  const adsReady = isAdsConfigured();

  const snippet = `<script src="${appUrl}/rf-lead.js"
        data-endpoint="${appUrl}/api/leads/intake"
        data-token="YOUR_LEAD_INTAKE_TOKEN"
        data-form="#enquiry-form"
        defer></script>`;

  const formExample = `<form id="enquiry-form">
  <input name="fullName" required />
  <input name="email" type="email" />
  <input name="phone" />
  <input name="countryOfBirth" />
  <textarea name="message"></textarea>
  <label><input type="checkbox" name="marketingConsent" /> Email me about EB-5</label>

  <!-- Spam trap: keep it visually hidden, never fill it in -->
  <input name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true" hidden />

  <button type="submit">Send enquiry</button>
</form>`;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Users, reference data, the website lead snippet and the state of the integrations."
      />

      <div className="space-y-12">
        {/* Users */}
        <section aria-labelledby="users-heading">
          <h2 id="users-heading" className="mb-1 font-serif text-lg font-medium">
            Users and access
          </h2>
          <p className="mb-5 text-sm text-ink-mute">
            Accounts are invite-only. Admin manages everything; Advisor can create and edit records; Read-only can
            view but not change.
          </p>

          <div className="surface mb-5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Last signed in</th>
                    <th scope="col" className="text-right">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={user.isActive ? undefined : 'opacity-55'}>
                      <td className="font-medium">
                        {user.name}
                        {user.id === actor.id ? <span className="ml-2 text-xs text-ink-mute">(you)</span> : null}
                      </td>
                      <td className="text-sm text-ink-soft">{user.email}</td>
                      <td>
                        <span className="chip border-line bg-cream-deep text-ink-soft">{ROLE_LABEL[user.role]}</span>
                        {!user.isActive ? (
                          <span className="ml-1 chip border-stage-rose/25 bg-stage-rose/10 text-stage-rose">
                            Deactivated
                          </span>
                        ) : null}
                      </td>
                      <td className="text-sm text-ink-mute">{formatDate(user.lastLoginAt)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <UserForm user={{ id: user.id, name: user.name, email: user.email, role: user.role }} />
                          {user.id !== actor.id ? (
                            <form action={toggleUserAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <button type="submit" className="btn-quiet">
                                {user.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="mb-3 text-sm font-semibold text-ink">Add a user</h3>
          <UserForm />
        </section>

        {/* Lead capture */}
        <section aria-labelledby="lead-heading">
          <h2 id="lead-heading" className="mb-1 font-serif text-lg font-medium">
            Website lead capture
          </h2>
          <p className="mb-5 max-w-3xl text-sm text-ink-mute">
            The snippet stores the GCLID and UTM parameters in a first-party cookie for 90 days, then posts the
            enquiry here as a Prospect. A record with a GCLID is marked Google Ads automatically.
          </p>

          <div className="mb-5">
            <Alert tone="warning" title="Consent is required in the UK and EU">
              The snippet only writes the cookie once Google Consent Mode v2 reports{' '}
              <code className="rounded bg-cream-deep px-1">analytics_storage</code> as granted. Set{' '}
              <code className="rounded bg-cream-deep px-1">window.rfConsentGranted</code> from your cookie banner to
              override that decision explicitly.
            </Alert>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CodeBlock label="Add to every page" code={snippet} />
            <CodeBlock label="Form field names it looks for" code={formExample} />
          </div>
        </section>

        {/* Integrations */}
        <section aria-labelledby="integrations-heading">
          <h2 id="integrations-heading" className="mb-1 font-serif text-lg font-medium">
            Integrations
          </h2>
          <p className="mb-5 text-sm text-ink-mute">
            Conversion events are recorded whether or not Google Ads is connected, so nothing is lost while the
            credentials are being set up.
          </p>

          <div className="surface divide-y divide-line">
            <IntegrationRow
              name="Google Ads offline conversions"
              connected={adsReady}
              detail={
                adsReady
                  ? 'Credentials present. Lead, Engaged and Funded conversions upload by GCLID.'
                  : 'Add GOOGLE_ADS_* variables in Railway to enable uploads. Events keep queueing until then.'
              }
              extra={conversionCounts
                .map((row) => `${row._count._all} ${row.status.toLowerCase()}`)
                .join(' · ')}
            />
            <IntegrationRow
              name="Email digests"
              connected={!!process.env.RESEND_API_KEY}
              detail={
                process.env.RESEND_API_KEY
                  ? 'A daily digest of follow-ups and commissions can be sent.'
                  : 'Add RESEND_API_KEY and ALERT_EMAIL_TO to send the daily digest.'
              }
            />
            <IntegrationRow
              name="Google Calendar → Meetings"
              connected={false}
              detail="Not connected. Meetings are logged by hand on the client record."
            />
          </div>
        </section>

        {/* Reference data */}
        <section aria-labelledby="reference-heading">
          <h2 id="reference-heading" className="mb-1 font-serif text-lg font-medium">
            Regional centres and projects
          </h2>
          <p className="mb-5 text-sm text-ink-mute">Carried over from the legacy export and editable here.</p>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface p-5">
              <h3 className="mb-3 text-sm font-semibold">Regional centres</h3>
              <ul className="mb-4 divide-y divide-line text-sm">
                {centres.map((centre) => (
                  <li key={centre.id} className="flex items-center justify-between py-2">
                    <span>{centre.name}</span>
                    <span className="text-xs text-ink-mute tabular">{centre._count.clients} clients</span>
                  </li>
                ))}
              </ul>
              <form action={createReferenceAction} className="flex gap-2">
                <input type="hidden" name="kind" value="centre" />
                <label className="sr-only" htmlFor="new-centre">
                  New regional centre
                </label>
                <input id="new-centre" name="name" className="field" placeholder="EB5 Capital" required />
                <button type="submit" className="btn-ghost shrink-0">
                  Add
                </button>
              </form>
            </div>

            <div className="surface p-5">
              <h3 className="mb-3 text-sm font-semibold">Projects</h3>
              <ul className="mb-4 max-h-72 divide-y divide-line overflow-y-auto text-sm">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{project.name}</span>
                      <span className="block text-xs text-ink-mute">{project.regionalCentre?.name ?? 'No centre'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-mute tabular">{project._count.clients}</span>
                  </li>
                ))}
              </ul>
              <form action={createReferenceAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="kind" value="project" />
                <label className="sr-only" htmlFor="new-project">
                  New project
                </label>
                <input id="new-project" name="name" className="field flex-1" placeholder="Skjol at Avon" required />
                <label className="sr-only" htmlFor="new-project-centre">
                  Regional centre
                </label>
                <select id="new-project-centre" name="regionalCentreId" className="field w-auto">
                  <option value="">No centre</option>
                  {centres.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-ghost shrink-0">
                  Add
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Data quality */}
        <section aria-labelledby="quality-heading">
          <h2 id="quality-heading" className="mb-1 font-serif text-lg font-medium">
            Data quality
          </h2>
          <p className="mb-5 text-sm text-ink-mute">
            Gaps carried over from the legacy export across {quality.total} records. Nothing here is an error — it is
            what the old system did not hold.
          </p>

          <div className="surface overflow-hidden">
            <ul className="divide-y divide-line">
              {quality.checks.map((check) => (
                <li key={check.label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span>
                    <span className="block text-sm font-medium text-ink">{check.label}</span>
                    <span className="block text-xs text-ink-mute">{check.hint}</span>
                  </span>
                  <span
                    className={`shrink-0 font-serif text-lg tabular ${
                      check.count === 0 ? 'text-stage-emerald' : 'text-ink'
                    }`}
                  >
                    {check.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading" className="mb-1 font-serif text-lg font-medium">
            Data rules
          </h2>
          <div className="surface p-6 text-sm leading-relaxed text-ink-soft">
            <ul className="space-y-2">
              <li>
                Never store passports, identity documents, source-of-funds evidence or bank details here. The
                attorney holds those.
              </li>
              <li>Uploaded files are served only to signed-in users through an authenticated route — they are never publicly linkable.</li>
              <li>
                Every status change is written to the{' '}
                <Link href="/activity" className="link">
                  activity log
                </Link>{' '}
                with who made it and when.
              </li>
              <li>Marketing consent is recorded per client and defaults to off for every migrated record.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

function IntegrationRow({
  name,
  connected,
  detail,
  extra,
}: {
  name: string;
  connected: boolean;
  detail: string;
  extra?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {name}
          <span
            className={`chip ${
              connected
                ? 'border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald'
                : 'border-line bg-cream-deep text-ink-mute'
            }`}
          >
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </p>
        <p className="mt-1 text-sm text-ink-mute">{detail}</p>
      </div>
      {extra ? <p className="shrink-0 text-xs text-ink-mute tabular">{extra}</p> : null}
    </div>
  );
}
