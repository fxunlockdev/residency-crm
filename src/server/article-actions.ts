'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { articleSchema, fieldErrors } from '@/lib/validation';
import { renderArticleHtml } from '@/lib/markdown';
import type { FormState } from './client-actions';

/**
 * Articles published to the public website.
 *
 * The markdown is rendered and sanitised here, on save, so the website only
 * ever inserts HTML this app produced. Publishing is a separate, deliberate
 * action from saving: an unfinished draft should never be one stray click
 * away from the public site.
 */

function parse(formData: FormData) {
  return articleSchema.safeParse(Object.fromEntries(formData.entries()));
}

export async function createArticleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  const { html } = renderArticleHtml(input.bodyMarkdown);

  let id: string;
  try {
    const article = await prisma.article.create({
      data: { ...input, bodyHtml: html, createdById: user.id },
      select: { id: true },
    });
    id = article.id;
  } catch (error) {
    if (isSlugTaken(error)) return { errors: { slug: 'That web address is already used by another article.' } };
    throw error;
  }

  await recordAudit({
    entity: 'Article',
    entityId: id,
    action: 'created',
    actor: user,
    summary: `${user.name} drafted the article “${input.title}”`,
  });

  revalidatePath('/insights');
  redirect(`/insights/${id}`);
}

export async function updateArticleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const id = String(formData.get('articleId') ?? '');
  const existing = await prisma.article.findUnique({ where: { id }, select: { slug: true, status: true, title: true } });
  if (!existing) return { message: 'That article no longer exists.' };

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  // A published address is already in links, bookmarks and search results.
  // Changing it would break all of them silently, so it is fixed from the
  // moment the article goes live.
  if (existing.status === 'PUBLISHED' && input.slug !== existing.slug) {
    return { errors: { slug: 'This article is published. Its web address can no longer change.' } };
  }

  const { html } = renderArticleHtml(input.bodyMarkdown);

  try {
    await prisma.article.update({ where: { id }, data: { ...input, bodyHtml: html } });
  } catch (error) {
    if (isSlugTaken(error)) return { errors: { slug: 'That web address is already used by another article.' } };
    throw error;
  }

  await recordAudit({
    entity: 'Article',
    entityId: id,
    action: 'updated',
    actor: user,
    summary: `${user.name} edited the article “${input.title}”`,
  });

  revalidatePath('/insights');
  return { ok: true, message: existing.status === 'PUBLISHED' ? 'Saved and live on the website.' : 'Draft saved.' };
}

export async function publishArticleAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const id = String(formData.get('articleId') ?? '');
  const article = await prisma.article.findUnique({
    where: { id },
    select: { title: true, status: true, publishedAt: true },
  });
  if (!article || article.status === 'PUBLISHED') return;

  await prisma.article.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      // Kept across a later unpublish and republish, so correcting a typo
      // next month does not shuffle an old article back to the top.
      publishedAt: article.publishedAt ?? new Date(),
    },
  });

  await recordAudit({
    entity: 'Article',
    entityId: id,
    action: 'published',
    actor: user,
    summary: `${user.name} published “${article.title}” to the website`,
  });

  revalidatePath('/insights');
  revalidatePath(`/insights/${id}`);
}

export async function unpublishArticleAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const id = String(formData.get('articleId') ?? '');
  const article = await prisma.article.findUnique({ where: { id }, select: { title: true, status: true } });
  if (!article || article.status !== 'PUBLISHED') return;

  await prisma.article.update({ where: { id }, data: { status: 'DRAFT' } });

  await recordAudit({
    entity: 'Article',
    entityId: id,
    action: 'unpublished',
    actor: user,
    summary: `${user.name} removed “${article.title}” from the website`,
  });

  revalidatePath('/insights');
  revalidatePath(`/insights/${id}`);
}

export async function deleteArticleAction(formData: FormData): Promise<void> {
  // Deleting a live page is how a URL starts returning 404 to everyone who
  // saved it, so only an administrator can.
  const user = await requireRoleOrRedirect('ADMIN');
  const id = String(formData.get('articleId') ?? '');
  const article = await prisma.article.findUnique({ where: { id }, select: { title: true } });
  if (!article) redirect('/insights');

  await prisma.article.delete({ where: { id } });
  await recordAudit({
    entity: 'Article',
    entityId: id,
    action: 'deleted',
    actor: user,
    summary: `${user.name} deleted the article “${article.title}”`,
  });

  revalidatePath('/insights');
  redirect('/insights');
}

function isSlugTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
