'use client';

import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";
import { slugify } from '@/lib/slug';

/**
 * The translation tabs of the campaign forms  one per language, driven by
 * `TRANSLATION_LOCALES`.
 *
 * Each tab is a title field on the react-hook-form, a rich-text description
 * held outside the form (Tiptap JSON, as the pages already keep it) and the
 * page's own per-locale media block. The two campaign pages render this twice
 * over and used to spell out eight copies of it each by hand.
 *
 * The description editor is uncontrolled  it takes a `defaultValue`  so a
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
  /** Rendered before the language tabs  the Arabic tab trigger. */
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
 *  Arabic tab  where the editor actually is when the text is finished  has
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
        {dt("تُترجم من النص العربي إلى كل اللغات دفعة واحدة. راجع كل لغة قبل الحفظ  الحفظ يبقى بزر المشروع نفسه.")}</p>
    </div>
  );
}

/** Arabic is the source locale and lives on Campaign, so its SEO needs an
 * explicit editor instead of accidentally storing it in a translation row. */
export function CampaignArabicSeoFields({
  form,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}) {
  const title = String(form.watch('title') ?? '');
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        {dt("الرابط وSEO العربي والأسئلة الشائعة")}
      </summary>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {dt("هذه إعدادات صفحة المشروع بالعربية. إيقاف الفهرسة لا يخفي الصفحة عن الزوار، والأسئلة لا تُنشر إلا بعد حفظ المشروع.")}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField control={form.control} name="slug" render={({ field }) => (
          <FormItem dir={dashDir()} className="md:col-span-2">
            <FormLabel>{dt("الرابط العربي (slug)")}</FormLabel>
            <div className="flex gap-2">
              <FormControl><Input {...field} value={field.value ?? ''} dir="ltr" placeholder={slugify(title) || 'project-slug'} /></FormControl>
              <button type="button" className="shrink-0 rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-100" onClick={() => form.setValue('slug', slugify(String(form.getValues('title') ?? '')), { shouldDirty: true })}>{dt("اشتقاق من العنوان")}</button>
            </div>
            <FormDescription>{dt("اتركه فارغًا لإنشائه تلقائيًا. تغيير رابط منشور يُحفظ مع رابط سابق صالح للتحويل.")}</FormDescription>
          </FormItem>
        )} />
        <FormField control={form.control} name="seoTitle" render={({ field }) => (
          <FormItem dir={dashDir()}><FormLabel>{dt("عنوان محرك البحث")}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} dir="rtl" maxLength={160} /></FormControl><FormDescription>{dtx("{0}/160 حرفًا", [String(field.value?.length ?? 0)])}</FormDescription></FormItem>
        )} />
        <FormField control={form.control} name="seoKeyword" render={({ field }) => (
          <FormItem dir={dashDir()}><FormLabel>{dt("عبارات البحث")}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} dir="rtl" maxLength={500} placeholder={dt("عبارات طبيعية مفصولة بفواصل")} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="seoDescription" render={({ field }) => (
          <FormItem dir={dashDir()} className="md:col-span-2"><FormLabel>{dt("وصف نتيجة البحث")}</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} dir="rtl" maxLength={220} className="min-h-20" /></FormControl><FormDescription>{dtx("{0}/220 حرفًا", [String(field.value?.length ?? 0)])}</FormDescription></FormItem>
        )} />
        <FormField control={form.control} name="ogTitle" render={({ field }) => (
          <FormItem dir={dashDir()}><FormLabel>{dt("عنوان المشاركة الاجتماعية")}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} dir="rtl" maxLength={180} /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="ogImage" render={({ field }) => (
          <FormItem dir={dashDir()}><FormLabel>{dt("صورة المشاركة الاجتماعية")}</FormLabel><FormControl><Input {...field} value={field.value ?? ''} dir="ltr" placeholder="https://…" /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="ogDescription" render={({ field }) => (
          <FormItem dir={dashDir()} className="md:col-span-2"><FormLabel>{dt("وصف المشاركة الاجتماعية")}</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} dir="rtl" maxLength={300} className="min-h-20" /></FormControl></FormItem>
        )} />
        <FormField control={form.control} name="seoNoIndex" render={({ field }) => (
          <FormItem dir={dashDir()} className="md:col-span-2 flex items-center justify-between gap-4 rounded-lg border bg-white p-3"><div><FormLabel>{dt("السماح بفهرسة هذه الصفحة")}</FormLabel><FormDescription>{dt("عند الإيقاف نضيف noindex لمحركات البحث. الصفحة تظل عامة ويمكن فتح رابطها.")}</FormDescription></div><FormControl><Switch checked={field.value !== 'true'} onCheckedChange={(checked) => field.onChange(checked ? 'false' : 'true')} /></FormControl></FormItem>
        )} />
        <CampaignFaqEditor form={form} name="faqContent" />
      </div>
    </details>
  );
}

function CampaignFaqEditor({ form, name }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  name: string;
}) {
  return <FormField control={form.control} name={name} render={({ field }) => {
    let rows: { q: string; a: string }[] = [];
    try {
      const parsed = JSON.parse(String(field.value ?? '[]'));
      if (Array.isArray(parsed)) rows = parsed.map((item) => ({ q: String(item?.q ?? item?.question ?? ''), a: String(item?.a ?? item?.answer ?? '') }));
    } catch { rows = []; }
    const save = (next: { q: string; a: string }[]) => field.onChange(JSON.stringify(next));
    return (
      <FormItem dir={dashDir()} className="md:col-span-2 rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between gap-3"><div><FormLabel>{dt("الأسئلة الشائعة المنشورة")}</FormLabel><FormDescription>{dt("أضف أسئلة وأجوبة دقيقة من معلومات المشروع. عند الحفظ تظهر للزوار مع بيانات FAQ المنظمة.")}</FormDescription></div><button type="button" className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium hover:bg-slate-50" onClick={() => save([...rows, { q: '', a: '' }])}>{dt("إضافة سؤال")}</button></div>
        <div className="mt-3 space-y-3">
          {rows.map((item, index) => <div key={index} className="grid gap-2 rounded-md border bg-slate-50 p-3 md:grid-cols-2">
            <Input value={item.q} maxLength={240} placeholder={dt("السؤال {0}", [index + 1])} onChange={(event) => save(rows.map((row, rowIndex) => rowIndex === index ? { ...row, q: event.target.value } : row))} />
            <Textarea value={item.a} maxLength={2000} placeholder={dt("الإجابة")} className="min-h-10" onChange={(event) => save(rows.map((row, rowIndex) => rowIndex === index ? { ...row, a: event.target.value } : row))} />
            <button type="button" className="justify-self-start text-xs text-red-700 hover:underline" onClick={() => save(rows.filter((_, rowIndex) => rowIndex !== index))}>{dt("حذف السؤال")}</button>
          </div>)}
          {!rows.length && <p className="text-xs text-slate-500">{dt("لا توجد أسئلة منشورة. يمكن تركها فارغة.")}</p>}
        </div>
      </FormItem>
    );
  }} />;
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
                  {dt("الإنجليزية مطلوبة  يُشتق معرّف الرابط (slug) من عنوانها.")}</AlertDescription>
              </Alert>
            ) : (
              <Alert className="flex items-center">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="mt-[5px]">
                  {dtx("ترجمة {0} اختيارية؛ إن تُركت فارغة يُعرض المحتوى العربي لهذه اللغة.", [name])}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name={localeKey('title', locale)}
              render={({ field }) => (
                <FormItem dir={dashDir()}>
                  <FormLabel>
                    {dtx("عنوان المشروع ({0}){1}", [name, required ? ' *' : ''])}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} dir={localeDir(locale)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem dir={dashDir()}>
              <FormLabel>{dtx("وصف المشروع ({0}){1}", [name, required ? ' *' : ''])}</FormLabel>
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
                {required ? dt("مطلوب  وصف كامل بالإنجليزية للمشروع وأهدافه.") : dt("وصف كامل للمشروع وأهدافه بهذه اللغة.")}
              </FormDescription>
            </FormItem>

            {renderMedia(locale)}

            <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                {dt("رابط الصفحة وSEO لهذه اللغة")}
              </summary>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {dt("هذه إعدادات صفحة المشروع بهذه اللغة. إظهار الصفحة في الموقع والفهرسة والنشر قرارات منفصلة؛ noindex لا يخفي الصفحة عن الزوار ولا يضمن ترتيبًا في البحث.")}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name={localeKey('slug', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()} className="md:col-span-2">
                      <FormLabel>{dt("رابط هذه اللغة (slug)")}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl><Input {...field} value={field.value ?? ''} dir="ltr" placeholder={slugify(String(form.getValues(localeKey('title', locale)) ?? '')) || 'project-slug'} /></FormControl>
                        <button
                          type="button"
                          className="shrink-0 rounded-md border bg-white px-3 text-xs font-medium hover:bg-slate-100"
                          onClick={() => form.setValue(localeKey('slug', locale), slugify(String(form.getValues(localeKey('title', locale)) ?? '')), { shouldDirty: true })}
                        >
                          {dt("اشتقاق من العنوان")}
                        </button>
                      </div>
                      <FormDescription>{dt("اتركه فارغًا لإنشائه تلقائيًا من العنوان. بعد نشر تغيير الرابط، يلزم تحويل دائم من الرابط السابق.")}</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('seoTitle', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()}>
                      <FormLabel>{dt("عنوان محرك البحث")}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir={localeDir(locale)} maxLength={80} /></FormControl>
                      <FormDescription>{dtx("{0}/80 حرفًا", [String(field.value?.length ?? 0)])}</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('seoKeyword', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()}>
                      <FormLabel>{dt("عبارات البحث المقترحة")}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir={localeDir(locale)} placeholder={dt("عبارات طبيعية مفصولة بفواصل")}/></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('seoDescription', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()} className="md:col-span-2">
                      <FormLabel>{dt("وصف نتيجة البحث")}</FormLabel>
                      <FormControl><Textarea {...field} value={field.value ?? ''} dir={localeDir(locale)} maxLength={220} className="min-h-20" /></FormControl>
                      <FormDescription>{dtx("{0}/220 حرفًا", [String(field.value?.length ?? 0)])}</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('ogTitle', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()}>
                      <FormLabel>{dt("عنوان المشاركة الاجتماعية")}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir={localeDir(locale)} maxLength={100} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('ogImage', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()}>
                      <FormLabel>{dt("صورة المشاركة الاجتماعية")}</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir="ltr" placeholder="https://…" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('ogDescription', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()} className="md:col-span-2">
                      <FormLabel>{dt("وصف المشاركة الاجتماعية")}</FormLabel>
                      <FormControl><Textarea {...field} value={field.value ?? ''} dir={localeDir(locale)} maxLength={220} className="min-h-20" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={localeKey('seoNoIndex', locale)}
                  render={({ field }) => (
                    <FormItem dir={dashDir()} className="md:col-span-2 flex items-center justify-between gap-4 rounded-lg border bg-white p-3">
                      <div>
                        <FormLabel>{dt("السماح بفهرسة هذه الصفحة")}</FormLabel>
                        <FormDescription>{dt("عند الإيقاف نضيف noindex لمحركات البحث. الصفحة تظل عامة ويمكن فتح رابطها.")}</FormDescription>
                      </div>
                      <FormControl><Switch checked={field.value !== 'true'} onCheckedChange={(checked) => field.onChange(checked ? 'false' : 'true')} /></FormControl>
                    </FormItem>
                  )}
                />
                <CampaignFaqEditor form={form} name={localeKey('faqContent', locale)} />
              </div>
            </details>
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
            <FormItem dir={dashDir()}>
              <FormLabel>{dt("عنوان التحديث *")}</FormLabel>
              <FormControl><Input {...field} placeholder={dt("أدخل عنوان التحديث")} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem dir={dashDir()}>
              <FormLabel>{dt("وصف التحديث *")}</FormLabel>
              <FormControl><Textarea {...field} placeholder={dt("اكتب وصف التحديث...")} className="min-h-[100px]" /></FormControl>
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
                <FormItem dir={dashDir()}>
                  <FormLabel>{dtx("عنوان التحديث ({0})", [name])}</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ''} dir={localeDir(locale)} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={localeKey('description', locale)}
              render={({ field }) => (
                <FormItem dir={dashDir()}>
                  <FormLabel>{dtx("وصف التحديث ({0})", [name])}</FormLabel>
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
