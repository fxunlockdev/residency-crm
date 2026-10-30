import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { heroImage } from '@/lib/article-images';
import { denyUnlessTrusted } from '@/lib/public-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const denied = denyUnlessTrusted(request);
  if (denied) return denied;

  const { slug } = await context.params;
  const article = await prisma.article.findFirst({
    where: { slug, status: 'PUBLISHED', publishedAt: { not: null } },
    select: {
      slug: true,
      title: true,
      kind: true,
      topic: true,
      standfirst: true,
      seoDescription: true,
      heroImage: true,
      bodyHtml: true,
      sourceNote: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(
    { ok: true, article: { ...article, hero: heroImage(article.heroImage) } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
