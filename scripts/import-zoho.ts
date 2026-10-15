/**
 * Imports the legacy "ZOHO FINAL" export into the CRM.
 *
 *   npx tsx scripts/import-zoho.ts --file "/path/to/ZOHO FINAL.csv" [--reset] [--dry-run] [--no-split-fee]
 *
 * The export is read as cp1252 (that is how it was produced) and never committed to git:
 * it contains client PII and is supplied at run time.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { PrismaClient, type Prisma } from '@prisma/client';
import { mapZohoRow, type ZohoRow } from '../src/lib/import/zoho-mapper';
import { formatReference } from '../src/lib/normalize';
import { formatCents } from '../src/lib/money';

const prisma = new PrismaClient();

type Args = { file: string; reset: boolean; dryRun: boolean; splitStagedFee: boolean; batch: string };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const file = get('--file') ?? process.env.ZOHO_CSV_PATH;
  if (!file) {
    throw new Error('Pass --file "/path/to/ZOHO FINAL.csv" or set ZOHO_CSV_PATH.');
  }
  return {
    file,
    reset: argv.includes('--reset'),
    dryRun: argv.includes('--dry-run'),
    splitStagedFee: !argv.includes('--no-split-fee'),
    batch: get('--batch') ?? 'zoho-final',
  };
}

function readCsv(path: string): ZohoRow[] {
  // The export is Windows-1252; decoding as UTF-8 corrupts the smart quotes.
  const text = new TextDecoder('windows-1252').decode(readFileSync(path));
  return parse(text, { columns: true, skip_empty_lines: true, trim: false, bom: true }) as ZohoRow[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = readCsv(args.file);
  console.log(`Read ${rows.length} rows from ${args.file}`);

  const mapped = rows.map((row, index) => ({ index, ...mapZohoRow(row, { splitStagedFee: args.splitStagedFee }) }));

  // Names are only printed with --verbose; otherwise the log stays free of PII.
  const verbose = process.argv.includes('--verbose');
  const warnings = mapped.flatMap((m) =>
    m.warnings.map((w) =>
      verbose ? `  row ${m.index + 2} (${m.client.fullName || 'unnamed'}): ${w}` : `  row ${m.index + 2}: ${w}`,
    ),
  );

  if (args.dryRun) {
    report(mapped, warnings);
    return;
  }

  if (args.reset) {
    // Meetings, commissions, documents and conversion events all cascade from
    // Client, so a reset would destroy work done since the migration.
    const [meetings, commissions, documents, conversions] = await Promise.all([
      prisma.meeting.count({ where: { client: { importBatch: args.batch } } }),
      prisma.commission.count({ where: { client: { importBatch: args.batch }, status: { in: ['INVOICED', 'PAID'] } } }),
      prisma.document.count({ where: { client: { importBatch: args.batch } } }),
      prisma.conversionEvent.count({ where: { client: { importBatch: args.batch }, status: 'SENT' } }),
    ]);
    const attached = meetings + commissions + documents + conversions;
    if (attached > 0 && !process.argv.includes('--force-destructive')) {
      throw new Error(
        `Refusing to reset: the imported clients already have ${meetings} meeting(s), ` +
          `${commissions} invoiced/paid commission(s), ${documents} document(s) and ${conversions} uploaded ` +
          'conversion(s) attached. All of these cascade on delete. Re-run with --force-destructive if that is ' +
          'genuinely what you want.',
      );
    }

    const deleted = await prisma.client.deleteMany({ where: { importBatch: args.batch } });
    console.log(`Removed ${deleted.count} previously imported clients (batch "${args.batch}").`);
  }

  const existing = await prisma.client.count();
  if (existing > 0 && !args.reset) {
    throw new Error(`Database already holds ${existing} clients. Re-run with --reset to replace the imported batch.`);
  }
  // References continue from whatever already exists so a re-import cannot
  // collide with clients created by the website form in the meantime.
  const startingSequence = await highestReference();

  // Reference tables first, so clients can link to them.
  const centreNames = unique(mapped.map((m) => m.client.regionalCentreName));
  const centres = new Map<string, string>();
  for (const name of centreNames) {
    const centre = await prisma.regionalCentre.upsert({ where: { name }, update: {}, create: { name } });
    centres.set(name, centre.id);
  }

  const projectPairs = new Map<string, string | null>();
  for (const m of mapped) {
    const projectName = m.client.projectName;
    if (!projectName) continue;
    if (!projectPairs.has(projectName)) {
      projectPairs.set(projectName, m.client.regionalCentreName);
    }
  }
  const projects = new Map<string, string>();
  for (const [name, centreName] of projectPairs) {
    const project = await prisma.project.upsert({
      where: { name },
      update: {},
      create: { name, regionalCentreId: centreName ? (centres.get(centreName) ?? null) : null },
    });
    projects.set(name, project.id);
  }
  console.log(`Reference data: ${centres.size} regional centres, ${projects.size} projects.`);

  // Clients, numbered in export order so references are stable across re-imports.
  const createdByName = new Map<string, string>();
  let sequence = startingSequence;
  for (const m of mapped) {
    sequence += 1;
    const { regionalCentreName, projectName, ...rest } = m.client;
    const data: Prisma.ClientCreateInput = {
      ...rest,
      reference: formatReference(sequence),
      importBatch: args.batch,
      regionalCentre: regionalCentreName && centres.has(regionalCentreName)
        ? { connect: { id: centres.get(regionalCentreName)! } }
        : undefined,
      project: projectName && projects.has(projectName)
        ? { connect: { id: projects.get(projectName)! } }
        : undefined,
      commissions: {
        create: m.commissions.map((commission) => ({
          ...commission,
          regionalCentreId: regionalCentreName ? (centres.get(regionalCentreName) ?? null) : null,
        })),
      },
    };
    const client = await prisma.client.create({ data, select: { id: true, fullName: true } });
    createdByName.set(client.fullName.toLowerCase(), client.id);
  }
  console.log(`Imported ${sequence} clients.`);

  // Second pass: turn referrer names into real links where the referrer is also a client.
  let linked = 0;
  const unlinked: string[] = [];
  const clientsWithReferrer = await prisma.client.findMany({
    where: { referredByName: { not: null }, importBatch: args.batch },
    select: { id: true, referredByName: true },
  });
  for (const client of clientsWithReferrer) {
    const match = createdByName.get((client.referredByName ?? '').toLowerCase());
    if (match && match !== client.id) {
      await prisma.client.update({ where: { id: client.id }, data: { referredById: match } });
      linked += 1;
    } else if (client.referredByName) {
      unlinked.push(client.referredByName);
    }
  }
  const distinctUnlinked = [...new Set(unlinked)].sort();
  console.log(`Linked ${linked} referrals to existing client records; ${distinctUnlinked.length} referrers are not clients.`);
  if (distinctUnlinked.length && process.argv.includes('--verbose')) {
    console.log('Unlinked referrers:', distinctUnlinked.join(', '));
  }

  await prisma.auditLog.create({
    data: {
      entity: 'Client',
      entityId: 'import',
      action: 'imported',
      summary: `Imported ${sequence} clients from ${args.file.split('/').pop()}`,
      actorLabel: 'Import script',
    },
  });

  report(mapped, warnings);
  await verify(args.batch);
}

/** Highest numeric reference already allocated, so the import continues from it. */
async function highestReference(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(NULLIF(regexp_replace("reference", '\D', '', 'g'), '')::bigint) AS max FROM "Client"
  `;
  const max = Number(rows[0]?.max ?? 0);
  return Number.isFinite(max) ? max : 0;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

function report(mapped: Array<ReturnType<typeof mapZohoRow> & { index: number }>, warnings: string[]): void {
  const statusCounts = new Map<string, number>();
  for (const m of mapped) statusCounts.set(m.client.status, (statusCounts.get(m.client.status) ?? 0) + 1);
  const sourceCounts = new Map<string, number>();
  for (const m of mapped) sourceCounts.set(m.client.source, (sourceCounts.get(m.client.source) ?? 0) + 1);

  const commissionTotal = mapped.flatMap((m) => m.commissions).reduce((sum, c) => sum + c.amountCents, 0);
  const paidTotal = mapped
    .flatMap((m) => m.commissions)
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + c.amountCents, 0);

  console.log('\n— Reconciliation —');
  console.log('Clients by status:', Object.fromEntries(statusCounts));
  console.log('Clients by source:', Object.fromEntries(sourceCounts));
  console.log(`Commission rows: ${mapped.flatMap((m) => m.commissions).length}`);
  console.log(`Commission value: ${formatCents(commissionTotal)} (paid ${formatCents(paidTotal)})`);
  console.log(`\nWarnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 40)) console.log(warning);
  if (warnings.length > 40) console.log(`  ...and ${warnings.length - 40} more`);
}

/** Re-read what landed in the database so the numbers are proven, not assumed. */
async function verify(batch: string): Promise<void> {
  const [clients, commissions, centres, projects, withEmail, withFilingDate] = await Promise.all([
    prisma.client.count({ where: { importBatch: batch } }),
    prisma.commission.count(),
    prisma.regionalCentre.count(),
    prisma.project.count(),
    prisma.client.count({ where: { importBatch: batch, email: { not: null } } }),
    prisma.client.count({ where: { importBatch: batch, i526eFiledDate: { not: null } } }),
  ]);
  const totals = await prisma.commission.aggregate({ _sum: { amountCents: true } });
  console.log('\n— In the database —');
  console.log({ clients, commissions, centres, projects, withEmail, withFilingDate });
  console.log('Commission total:', formatCents(totals._sum.amountCents ?? 0));
}

main()
  .catch((error) => {
    console.error('\nImport failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
