'use client';

import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/locales';
import { AutoTranslateButton, mergeTranslations } from './AutoTranslateButton';
import { dashDir, dt } from "@/lib/dashboard/i18n";

/**
 * Locale tabs for the site-content forms.
 *
 * The slide form declares every translated field for every locale as its own
 * react-hook-form entry (`title_en`, `description_en`, …). That was workable at
 * 8 locales; the site now publishes 19, and three translated fields would mean
 * 57 hand-written schema keys per section  which is how the slide form quietly
 * ended up covering only 8 of the 19 in the first place. Driving the tabs from
 * `SUPPORTED_LOCALES` means a new language appears in every content form the day
 * it is added to that list.
 *
 * Arabic is deliberately absent: it is the master copy and lives on the parent
 * row, edited in the form's own fields above these tabs.
 */

export type TranslationField = {
  name: string;
  label: string;
  /** Renders a textarea instead of a single line. */
  multiline?: boolean;
};

export type TranslationMap = Record<string, Record<string, string>>;

const OTHER_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== 'ar') as readonly SupportedLocale[];

export function emptyTranslations(fields: readonly TranslationField[]): TranslationMap {
  const out: TranslationMap = {};
  for (const locale of OTHER_LOCALES) {
    out[locale] = Object.fromEntries(fields.map((f) => [f.name, '']));
  }
  return out;
}

/** Fold rows returned by an API back into the map the form edits. */
export function translationsFromRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: readonly TranslationField[]
): TranslationMap {
  const out = emptyTranslations(fields);
  for (const row of rows) {
    const locale = typeof row.locale === 'string' ? row.locale : '';
    if (!locale || !out[locale]) continue;
    for (const f of fields) {
      const v = row[f.name];
      out[locale][f.name] = typeof v === 'string' ? v : '';
    }
  }
  return out;
}

/** How many locales carry content  shown so gaps are visible before saving. */
export function filledLocaleCount(
  translations: TranslationMap,
  requiredField: string
): number {
  return OTHER_LOCALES.filter((l) => (translations[l]?.[requiredField] ?? '').trim()).length;
}

export function ContentTranslationTabs({
  fields,
  value,
  onChange,
  requiredField,
  source,
  itemLabel,
}: {
  fields: readonly TranslationField[];
  value: TranslationMap;
  onChange: (next: TranslationMap) => void;
  /** Clearing this field drops the whole locale  the API deletes that row. */
  requiredField: string;
  /**
   * The Arabic master copy, by the same field names as `fields`. When given,
   * a "translate into every language" button appears above the tabs and fills
   * the map from it; the editor still reviews and saves.
   */
  source?: Record<string, string>;
  /** What the item is, for the translator  "FAQ", "story", "course"… */
  itemLabel?: string;
}) {
  const currentDraft = useRef(value);
  currentDraft.current = value;
  const set = (locale: string, field: string, next: string) => {
    const updated = { ...currentDraft.current, [locale]: { ...(currentDraft.current[locale] ?? {}), [field]: next } };
    currentDraft.current = updated;
    onChange(updated);
  };
  const complete = OTHER_LOCALES.filter(code =>
    fields.every(field => (value[code]?.[field.name] ?? '').trim())
  ).length;
  const missing = OTHER_LOCALES.filter(code => !(value[code]?.[requiredField] ?? '').trim()).length;
  const needsReview = OTHER_LOCALES.length - complete - missing;

  return (
    <>
    {source ? (
      <div className="pb-1">
        <AutoTranslateButton
          source={source}
          itemLabel={itemLabel}
          onResult={(translations, overwrite) => {
            const updated = mergeTranslations(currentDraft.current, translations, overwrite, fields.map(field => field.name));
            currentDraft.current = updated;
            onChange(updated);
          }}
        />
      </div>
    ) : null}
    <div role="status" aria-live="polite" className="flex flex-wrap gap-3 text-xs text-slate-600">
      <span>{dt("مكتمل")}: {complete}/{OTHER_LOCALES.length}</span>
      <span>{dt("يحتاج ترجمة")}: {missing}</span>
      <span>{dt("يحتاج استكمالًا أو مراجعة")}: {needsReview}</span>
    </div>
    <Tabs defaultValue={OTHER_LOCALES[0]} dir={dashDir()}>
      <TabsList className="flex flex-wrap h-auto gap-1">
        {OTHER_LOCALES.map((locale) => {
          const filled = (value[locale]?.[requiredField] ?? '').trim().length > 0;
          const completed = fields.every(field => (value[locale]?.[field.name] ?? '').trim());
          return (
            <TabsTrigger key={locale} value={locale} className="gap-1.5">
              {/* The endonym, not a flag: a language is not a country, and the
                  19 locales here have no honest one-to-one country mapping. */}
              <span>{LOCALES[locale].nativeLabel}</span>
              {/* A quiet dot rather than a count: the point is only "has content". */}
              <span
                aria-hidden="true"
                title={completed ? dt("مكتمل") : filled ? dt("يحتاج استكمالًا") : dt("يحتاج ترجمة")}
                className={`h-1.5 w-1.5 rounded-full ${completed ? 'bg-emerald-500' : filled ? 'bg-amber-500' : 'bg-slate-300'}`}
              />
            </TabsTrigger>
          );
        })}
      </TabsList>

      {OTHER_LOCALES.map((locale) => (
        <TabsContent key={locale} value={locale} className="space-y-3 pt-3">
          <p className="text-xs text-slate-500">
            {dt("اترك حقل «")}{fields.find((f) => f.name === requiredField)?.label}{dt("» فارغًا لحذف ترجمة هذه اللغة.")}</p>
          {fields.map((field) =>
            field.multiline ? (
              <label key={field.name} className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">{field.label}</span>
                <Textarea
                  dir={LOCALES[locale].direction}
                  rows={3}
                  value={value[locale]?.[field.name] ?? ''}
                  onChange={(e) => set(locale, field.name, e.target.value)}
                />
              </label>
            ) : (
              <label key={field.name} className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">{field.label}</span>
                <Input
                  dir={LOCALES[locale].direction}
                  value={value[locale]?.[field.name] ?? ''}
                  onChange={(e) => set(locale, field.name, e.target.value)}
                />
              </label>
            )
          )}
        </TabsContent>
      ))}
    </Tabs>
    </>
  );
}
