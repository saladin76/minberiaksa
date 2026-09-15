'use client';

import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TabsContent, TabsList } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import WysiwygEditor from '@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor';
import {
  LocaleTabTrigger,
  TRANSLATION_LOCALES,
  localeDir,
  localeKey,
  localeNativeLabel,
  type TranslationLocale,
} from '../../_components/locale-form';
import { AutoTranslateButton, type TranslatedLocales } from '../../_components/AutoTranslateButton';

/**
 * The translation tabs of the campaign forms — one per language, driven by
 * `TRANSLATION_LOCALES`.
 *
 * Each tab is a title field on the react-hook-form, a rich-text description
 * held outside the form (Tiptap JSON, as the pages already keep it) and the
 * page's own per-locale media block. The two campaign pages render this twice
 * over and used to spell out eight copies of it each by hand.
 *
 * The description editor is uncontrolled — it takes a `defaultValue` — so a
 * machine translation written into state would not appear on screen. The
 * `editorVersion` counter is part of each editor's key: bump it after filling
 * descriptions and every editor remounts with the new text.
 */

export interface CampaignLocaleTabsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  /** Tiptap JSON per locale, or null while untouched. */
  descriptions: Record<string, string | null>;
  onDescription: (locale: TranslationLocale, json: string) => void;
  /** Bumped by the page after a bulk fill so the editors remount. */
  editorVersion: number;
  parseEditorContent: (json: string | null) => unknown;
  editorClassName: string;
  /** The page's per-locale cover/video block. */
  renderMedia: (locale: TranslationLocale) => ReactNode;
  /** Which locales count as complete, for the tick on the tab. */
  done: Record<string, boolean>;
  /** The Arabic master copy the translator works from. */
  arabic: { title: string; description: string | null };
  /** Called with the machine translations; the page writes them into its state. */
  onTranslated: (translations: TranslatedLocales, overwrite: boolean) => void;
  /** English is the one locale the site requires. */
  requiredLocales?: readonly string[];
  /** Rendered before the language tabs — the Arabic tab trigger. */
  leadingTrigger?: ReactNode;
}

export function CampaignLocaleTabTriggers({
  done,
  requiredLocales = ['en'],
  leadingTrigger,
}: Pick<CampaignLocaleTabsProps, 'done' | 'requiredLocales' | 'leadingTrigger'>) {
  return (
    <TabsList className="mb-6 flex h-auto flex-wrap gap-1">
      {leadingTrigger}
      {TRANSLATION_LOCALES.map((locale) => (
        <LocaleTabTrigger key={locale} locale={locale} required={requiredLocales.includes(locale)} done={!!done[locale]} />
      ))}
    </TabsList>
  );
}

/** The translate button as it appears on every campaign tab, exported so the
 *  Arabic tab — where the editor actually is when the text is finished — has
 *  it too. */
export function CampaignTranslateBar({
  arabic,
  onTranslated,
}: Pick<CampaignLocaleTabsProps, 'arabic' | 'onTranslated'>) {
  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
      <AutoTranslateButton
        source={{ title: arabic.title }}
        richSource={{ description: arabic.description ?? '' }}
        itemLabel="fundraising campaign"
        onResult={onTranslated}
      />
      <p className="mt-2 text-[11px] text-slate-600">
        تُترجم من النص العربي إلى كل اللغات دفعة واحدة. راجع كل لغة قبل الحفظ — الحفظ يبقى بزر المشروع نفسه.
      </p>
    </div>
  );
}

export function CampaignLocaleTabContents({
  form,
  descriptions,
  onDescription,
  editorVersion,
  parseEditorContent,
  editorClassName,
  renderMedia,
  arabic,
  onTranslated,
  requiredLocales = ['en'],
}: Omit<CampaignLocaleTabsProps, 'done' | 'leadingTrigger'>) {
  const translateBar = <CampaignTranslateBar arabic={arabic} onTranslated={onTranslated} />;

  return (
    <>
      {TRANSLATION_LOCALES.map((locale) => {
        const name = localeNativeLabel(locale);
        const required = requiredLocales.includes(locale);
        return (
          <TabsContent key={locale} value={locale} className="space-y-6">
            {translateBar}

            {required ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="mt-[5px]">
                  الإنجليزية مطلوبة — يُشتق معرّف الرابط (slug) من عنوانها.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="flex items-center">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="mt-[5px]">
                  ترجمة {name} اختيارية؛ إن تُركت فارغة يُعرض المحتوى العربي لهذه اللغة.
                </AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name={localeKey('title', locale)}
              render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>
                    عنوان المشروع ({name}){required ? ' *' : ''}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} dir={localeDir(locale)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem dir="rtl">
              <FormLabel>وصف المشروع ({name}){required ? ' *' : ''}</FormLabel>
              <div dir={localeDir(locale)}>
                <WysiwygEditor
                  key={`${locale}-${editorVersion}`}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  defaultValue={parseEditorContent(descriptions[locale] ?? null) as any}
                  onUpdate={(editor) => onDescription(locale, JSON.stringify(editor?.getJSON()))}
                  className={editorClassName}
                />
              </div>
              <FormDescription>
                {required ? 'مطلوب — وصف كامل بالإنجليزية للمشروع وأهدافه.' : 'وصف كامل للمشروع وأهدافه بهذه اللغة.'}
              </FormDescription>
            </FormItem>

            {renderMedia(locale)}
          </TabsContent>
        );
      })}
    </>
  );
}

/* ── Campaign updates ────────────────────────────────────────────────────── */

/**
 * The language tabs of the "campaign update" dialogs: a title and a plain-text
 * description per locale, both on the update form as `title_xx` /
 * `description_xx`. Arabic is the first tab and lives on `title` /
 * `description`. The translate button reads those two Arabic fields and fills
 * every other tab.
 */
export function UpdateLocaleTabs({
  form,
  onTranslated,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  onTranslated: (translations: TranslatedLocales, overwrite: boolean) => void;
}) {
  return (
    <>
      <TabsList className="flex h-auto flex-wrap gap-1">
        <LocaleTabTrigger locale="ar" required className="gap-1.5" />
        {TRANSLATION_LOCALES.map((locale) => (
          <LocaleTabTrigger key={locale} locale={locale} className="gap-1.5" />
        ))}
      </TabsList>

      <TabsContent value="ar" className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem dir="rtl">
              <FormLabel>عنوان التحديث *</FormLabel>
              <FormControl><Input {...field} placeholder="أدخل عنوان التحديث" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem dir="rtl">
              <FormLabel>وصف التحديث *</FormLabel>
              <FormControl><Textarea {...field} placeholder="اكتب وصف التحديث..." className="min-h-[100px]" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <AutoTranslateButton
          source={{ title: form.watch('title') ?? '', description: form.watch('description') ?? '' }}
          itemLabel="campaign progress update"
          onResult={onTranslated}
        />
      </TabsContent>

      {TRANSLATION_LOCALES.map((locale) => {
        const name = localeNativeLabel(locale);
        return (
          <TabsContent key={locale} value={locale} className="space-y-4">
            <FormField
              control={form.control}
              name={localeKey('title', locale)}
              render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>عنوان التحديث ({name})</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} dir={localeDir(locale)} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={localeKey('description', locale)}
              render={({ field }) => (
                <FormItem dir="rtl">
                  <FormLabel>وصف التحديث ({name})</FormLabel>
                  <FormControl><Textarea {...field} value={field.value ?? ''} dir={localeDir(locale)} className="min-h-[100px]" /></FormControl>
                </FormItem>
              )}
            />
          </TabsContent>
        );
      })}
    </>
  );
}
