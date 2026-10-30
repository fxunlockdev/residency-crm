import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { denyUnlessTrusted } from '@/lib/public-api';
import { heroImage } from '@/lib/article-images';

export const dynamic = 'force-dynamic';

/** Published articles, for the public website to render. */
export async function GET(request: NextRequest) {
  const denied = denyUnlessTrusted(request);
  if (denied) return denied;

  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED', publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
    select: {
      slug: true,
      title: true,
      kind: true,
      topic: true,
      standfirst: true,
      seoDescription: true,
      heroImage: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { ok: true, articles: articles.map((article) => ({ ...article, hero: heroImage(article.heroImage) })) },
    // The website caches these itself; this stops any intermediary holding a
    // stale list after an article is unpublished.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
