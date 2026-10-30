import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDate } from '@/lib/dates';
import { siteUrl } from '@/lib/newsletter-send';
import { PageHeader } from '@/components/ui/page-header';
import { SubmitButton } from '@/components/ui/submit-button';
import { ArticleForm } from '@/components/articles/article-form';
import {
  deleteArticleAction,
  publishArticleAction,
  unpublishArticleAction,
  updateArticleAction,
} from '@/server/article-actions';

export const metadata: Metadata = { title: 'Edit article' };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('ADVISOR');
  const { id } = await params;

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) notFound();

  const published = article.status === 'PUBLISHED';
  const liveUrl = `${siteUrl()}/insights/${article.slug}/`;

  return (
    <>
      <PageHeader
        eyebrow="News & insights"
        title={published ? 'Live on the website' : 'Draft'}
        description={
          published ? (
            <>
              Published {formatDate(article.publishedAt)} at{' '}
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {liveUrl}
              </a>
              . Saved edits appear on the site within a minute.
            </>
          ) : (
            'Only visible here. Publish it to put it on the public site.'
          )
        }
        actions={
          <>
            {published ? (
              <form action={unpublishArticleAction}>
                <input type="hidden" name="articleId" value={article.id} />
                <SubmitButton
                  className="btn-quiet"
                  confirm="Take this article off the public website? Anyone with the link will get a page-not-found."
                >
                  Unpublish
                </SubmitButton>
              </form>
            ) : (
              <form action={publishArticleAction}>
                <input type="hidden" name="articleId" value={article.id} />
                <SubmitButton className="btn-primary">Publish to the website</SubmitButton>
              </form>
            )}
            {user.role === 'ADMIN' ? (
              <form action={deleteArticleAction}>
                <input type="hidden" name="articleId" value={article.id} />
                <SubmitButton className="btn-quiet-danger" confirm="Delete this article permanently?">
                  Delete
                </SubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <ArticleForm
        action={updateArticleAction}
        article={article}
        submitLabel={published ? 'Save and update the website' : 'Save draft'}
        cancelHref="/insights"
      />

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="font-serif text-base font-medium text-ink">Preview</h2>
        <p className="mt-1.5 text-sm text-ink-mute">
          The exact markup the website will serve, in this app&rsquo;s typefaces rather than the site&rsquo;s.
        </p>
        {/* The HTML came from this app's own sanitiser on save, never straight
            from the author's keystrokes. */}
        <div className="article-preview surface mt-5 px-6 py-6" dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
      </section>
    </>
  );
}
