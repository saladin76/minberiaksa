'use client';

import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AutoTranslateButton, type TranslatedLocales } from './AutoTranslateButton';
import {
  LocaleTabTrigger,
  TRANSLATION_LOCALES,
  isTranslationLocale,
  localeDir,
  localeKey,
  localeNativeLabel,
} from './locale-form';

/**
 * Language tabs for the react-hook-form pages whose translations are a few
 * plain fields — categories (name, description) and slides (title,
 * description, button text). Arabic is the first tab and is rendered by the
 * page; every other locale is generated here from `TRANSLATION_LOCALES`,
 * bound to `field_locale` entries on the same form.
 *
 * The Arabic tab also carries the translate button: it reads the Arabic
 * fields off the form and fills the others through `applyLocaleTranslations`.
 */

export interface LocaleFormField {
  name: string;
  label: string;
  multiline?: boolean;
  /** Only ever English, in practice — the site's fallback language. */
  requiredIn?: readonly string[];
  maxLength?: number;
}

export function LocaleFormTabs({
  form,
  fields,
  arabic,
  itemLabel,
  className,
  extra,
  value,
  onValueChange,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  fields: readonly LocaleFormField[];
  /** The page's own Arabic tab content. */
  arabic: ReactNode;
  itemLabel: string;
  className?: string;
  /** Rendered under the fields of every tab — the per-locale SEO card, say. */
  extra?: (locale: string) => ReactNode;
  /** Controlled tab, for pages that track the active locale. */
  value?: string;
  onValueChange?: (locale: string) => void;
}) {
  const source = Object.fromEntries(fields.map((f) => [f.name, String(form.watch(f.name) ?? '')]));

  return (
    <Tabs defaultValue="ar" value={value} onValueChange={onValueChange} className={className ?? 'w-full'}>
      <TabsList className="mb-4 flex h-auto flex-wrap gap-1" dir="rtl">
        <LocaleTabTrigger locale="ar" />
        {TRANSLATION_LOCALES.map((locale) => (
          <LocaleTabTrigger
            key={locale}
            locale={locale}
            required={fields.some((f) => f.requiredIn?.includes(locale))}
            done={fields.some((f) => String(form.watch(localeKey(f.name, locale)) ?? '').trim())}
          />
        ))}
      </TabsList>

      <TabsContent value="ar" className="mt-0 space-y-4">
        {arabic}
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
          <AutoTranslateButton
            source={source}
            itemLabel={itemLabel}
            onResult={(translations, overwrite) => applyLocaleTranslations(form, fields, translations, overwrite)}
          />
          <p className="mt-2 text-[11px] text-slate-600">تُترجم الحقول العربية أعلاه إلى كل اللغات؛ راجعها في تبويباتها ثم احفظ.</p>
        </div>
        {extra?.('ar')}
      </TabsContent>

      {TRANSLATION_LOCALES.map((locale) => {
        const name = localeNativeLabel(locale);
        return (
          <TabsContent key={locale} value={locale} className="mt-0 space-y-6">
            <Card className="p-6">
              <div className="grid gap-6">
                {fields.map((f) => {
                  const required = f.requiredIn?.includes(locale);
                  return (
                    <FormField
                      key={f.name}
                      control={form.control}
                      name={localeKey(f.name, locale)}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {f.label} ({name}){required ? ' *' : ''}
                          </FormLabel>
                          <FormControl>
                            {f.multiline ? (
                              <Textarea {...field} value={field.value ?? ''} dir={localeDir(locale)} className="resize-y" maxLength={f.maxLength} />
                            ) : (
                              <Input {...field} value={field.value ?? ''} dir={localeDir(locale)} maxLength={f.maxLength} />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })}
              </div>
            </Card>
            {extra?.(locale)}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/** Write machine translations into `field_locale` entries; empty targets only unless `overwrite`. */
export function applyLocaleTranslations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>,
  fields: readonly LocaleFormField[],
  translations: TranslatedLocales,
  overwrite: boolean
) {
  for (const [code, t] of Object.entries(translations)) {
    if (!isTranslationLocale(code)) continue;
    for (const f of fields) {
      const value = t.fields[f.name];
      if (!value) continue;
      const key = localeKey(f.name, code);
      if (overwrite || !String(form.getValues(key) ?? '').trim()) {
        form.setValue(key, f.maxLength ? value.slice(0, f.maxLength) : value, { shouldDirty: true });
      }
    }
  }
}

/** `{ [locale]: { [field]: value } }` from the form — what the category and slide APIs accept. */
export function collectLocaleTranslations(
  values: Record<string, unknown>,
  fields: readonly LocaleFormField[]
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    TRANSLATION_LOCALES.map((locale) => [
      locale,
      Object.fromEntries(fields.map((f) => [f.name, String(values[localeKey(f.name, locale)] ?? '')])),
    ])
  );
}
