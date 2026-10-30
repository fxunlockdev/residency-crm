import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate, formatDateTime } from '@/lib/dates';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'News & insights' };

export default async function ArticlesPage() {
  await requireRole('VIEWER');

  const articles = await prisma.article.findMany({
    orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="News & insights"
        description="Articles published to residencyfirst.com/insights. They appear on the site as soon as they are published here, alongside the five that shipped with the site."
        actions={
          <Link href="/insights/new" className="btn-primary">
            Write an article
          </Link>
        }
      />

      {articles.length === 0 ? (
        <EmptyState
          title="No articles yet"
          description="Write one here and it appears on the public site the moment you publish it."
        />
      ) : (
        <div className="surface divide-y divide-line">
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`/insights/${article.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-cream-warm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{article.title}</p>
                <p className="mt-1 text-xs text-ink-mute">
                  {article.kind} · /insights/{article.slug}/
                  {article.createdBy ? ` · ${article.createdBy.name}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-ink-mute">
                  {article.status === 'PUBLISHED'
                    ? `Published ${formatDate(article.publishedAt)}`
                    : `Edited ${formatDateTime(article.updatedAt)}`}
                </span>
                <span
                  className={
                    article.status === 'PUBLISHED'
                      ? 'chip border-stage-emerald/30 bg-stage-emerald/8 text-stage-emerald'
                      : 'chip'
                  }
                >
                  {article.status === 'PUBLISHED' ? 'Live' : 'Draft'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
