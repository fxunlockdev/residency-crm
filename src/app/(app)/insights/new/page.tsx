import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { ArticleForm } from '@/components/articles/article-form';
import { createArticleAction } from '@/server/article-actions';

export const metadata: Metadata = { title: 'Write an article' };

export default async function NewArticlePage() {
  await requireRole('ADVISOR');

  return (
    <>
      <PageHeader
        eyebrow="News & insights"
        title="Write an article"
        description="Saved as a draft. Nothing reaches the public site until you publish it."
      />
      <ArticleForm action={createArticleAction} submitLabel="Save draft" cancelHref="/insights" />
    </>
  );
}
