'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { Article } from '@prisma/client';
import { Field, FormSection } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { HERO_IMAGES } from '@/lib/article-images';
import { ARTICLE_KINDS } from '@/lib/article-images';
import { slugify } from '@/lib/slug';
import type { FormState } from '@/server/client-actions';

export function ArticleForm({
  action,
  article,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  article?: Article | null;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const errors = state.errors ?? {};

  const published = article?.status === 'PUBLISHED';
  const [slug, setSlug] = useState(article?.slug ?? '');
  // Only a slug the author has not touched follows the headline. Once they
  // type their own, the headline stops overwriting it.
  const [slugEdited, setSlugEdited] = useState(Boolean(article?.slug));

  return (
    <form action={formAction} className="pb-24" noValidate>
      {article ? <input type="hidden" name="articleId" value={article.id} /> : null}

      {state.message ? (
        <div className="mb-6">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      ) : null}

      <FormSection title="Headline" description="What a reader sees first, on the index and at the top of the article.">
        <Field label="Headline" name="title" error={errors.title} required className="sm:col-span-2">
          <input
            id="title"
            name="title"
            defaultValue={article?.title ?? ''}
            className="field"
            required
            maxLength={160}
            onChange={(event) => {
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
          />
        </Field>

        <Field
          label="Web address"
          name="slug"
          error={errors.slug}
          required
          className="sm:col-span-2"
          hint={
            published
              ? 'Fixed. This address is already published, and changing it would break every link to it.'
              : `The article will live at residencyfirst.com/insights/${slug || '…'}/`
          }
        >
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            className="field"
            required
            readOnly={published}
            maxLength={80}
            spellCheck={false}
          />
        </Field>

        <Field label="Category" name="kind" error={errors.kind} required hint="Which filter button it sits behind.">
          <select id="kind" name="kind" defaultValue={article?.kind ?? ARTICLE_KINDS[0]} className="field" required>
            {ARTICLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Topic"
          name="topic"
          error={errors.topic}
          required
          hint="Shown before the date, for example “Visa availability”."
        >
          <input id="topic" name="topic" defaultValue={article?.topic ?? ''} className="field" required maxLength={60} />
        </Field>

        <Field
          label="Summary"
          name="standfirst"
          error={errors.standfirst}
          required
          className="sm:col-span-2"
          hint="One sentence. Sits under the headline and is the excerpt on the index page."
        >
          <textarea
            id="standfirst"
            name="standfirst"
            defaultValue={article?.standfirst ?? ''}
            className="field"
            rows={2}
            required
            maxLength={300}
          />
        </Field>

        <Field
          label="Search description"
          name="seoDescription"
          error={errors.seoDescription}
          required
          className="sm:col-span-2"
          hint="What Google and link previews show. Around 150 characters reads best."
        >
          <textarea
            id="seoDescription"
            name="seoDescription"
            defaultValue={article?.seoDescription ?? ''}
            className="field"
            rows={2}
            required
            maxLength={320}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Hero image"
        description="Artwork the site already uses, with the caption and alt text it is already published with."
      >
        <fieldset className="sm:col-span-2">
          <legend className="sr-only">Hero image</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {HERO_IMAGES.map((image, index) => (
              <label
                key={image.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-field bg-cream-warm p-3 transition-colors hover:border-ink-soft has-[:checked]:border-pink-deep"
              >
                <input
                  type="radio"
                  name="heroImage"
                  value={image.key}
                  defaultChecked={article ? article.heroImage === image.key : index === 0}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{image.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">{image.caption}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.heroImage ? (
            <p className="field-error" role="alert">
              {errors.heroImage}
            </p>
          ) : null}
        </fieldset>
      </FormSection>

      <FormSection
        title="Article"
        description="Markdown. Use ## for section headings, - for bullets, and [text](https://…) for links."
      >
        <Field label="Body" name="bodyMarkdown" error={errors.bodyMarkdown} required className="sm:col-span-2">
          <textarea
            id="bodyMarkdown"
            name="bodyMarkdown"
            defaultValue={article?.bodyMarkdown ?? ''}
            className="field font-mono text-[13px] leading-relaxed"
            rows={26}
            required
            spellCheck
          />
        </Field>

        <Field
          label="Sources"
          name="sourceNote"
          error={errors.sourceNote}
          className="sm:col-span-2"
          hint="Optional closing line. Link the official source a reader should check before acting."
        >
          <textarea
            id="sourceNote"
            name="sourceNote"
            defaultValue={article?.sourceNote ?? ''}
            className="field"
            rows={2}
            maxLength={1200}
          />
        </Field>
      </FormSection>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn-quiet">
          Cancel
        </Link>
      </div>
    </form>
  );
}
