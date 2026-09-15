'use client';

import ReactCountryFlag from 'react-country-flag';
import { CheckCircle2 } from 'lucide-react';
import { TabsTrigger } from '@/components/ui/tabs';
import { LOCALES, SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/locales';

/**
 * The per-locale plumbing the react-hook-form pages share.
 *
 * The campaign, category and slide forms declare every translated field for
 * every locale as its own form entry — `title_en`, `title_fr`, … — and until
 * now they spelled those out by hand for eight locales, which is how the site
 * came to publish nineteen languages while its editors could only write
 * eight. Everything here is derived from `SUPPORTED_LOCALES`, so adding a
 * language to that list adds it to every form the same day.
 */

/** Every locale an editor translates into — all but the Arabic master copy. */
export const TRANSLATION_LOCALES = SUPPORTED_LOCALES.filter((l) => l !== 'ar') as Exclude<SupportedLocale, 'ar'>[];
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];
export type FormLocale = SupportedLocale;

export function isTranslationLocale(value: string): value is TranslationLocale {
  return (TRANSLATION_LOCALES as readonly string[]).includes(value);
}

/** The flag each language is shown with. A language is not a country; these
 *  are the conventional pairings and nothing more. */
const FLAG: Record<SupportedLocale, string> = {
  ar: 'SA', en: 'GB', fr: 'FR', tr: 'TR', id: 'ID', pt: 'PT', es: 'ES', de: 'DE',
  ur: 'PK', sq: 'AL', it: 'IT', nl: 'NL', sv: 'SE', no: 'NO', da: 'DK', ms: 'MY',
  ja: 'JP', zh: 'CN', hi: 'IN',
};

export function localeFlag(locale: string): string {
  return FLAG[locale as SupportedLocale] ?? 'UN';
}

export function localeNativeLabel(locale: string): string {
  return LOCALES[locale as SupportedLocale]?.nativeLabel ?? locale;
}

export function localeDir(locale: string): 'rtl' | 'ltr' {
  return LOCALES[locale as SupportedLocale]?.direction ?? 'ltr';
}

/** `field_locale` — the key convention every one of these forms uses. */
export function localeKey<F extends string, L extends string>(field: F, locale: L): `${F}_${L}` {
  return `${field}_${locale}`;
}

/** `{ title_en: '', title_fr: '', … }` for the given fields across every translation locale. */
export function localeDefaults(fields: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of TRANSLATION_LOCALES) for (const field of fields) out[localeKey(field, locale)] = '';
  return out;
}

/** One tab trigger per language: flag, endonym, required star, done tick. */
export function LocaleTabTrigger({
  locale,
  required,
  done,
  className,
}: {
  locale: string;
  required?: boolean;
  done?: boolean;
  className?: string;
}) {
  return (
    <TabsTrigger value={locale} className={className ?? 'gap-2'}>
      <ReactCountryFlag countryCode={localeFlag(locale)} svg style={{ width: '1em', height: '1em', verticalAlign: 'middle' }} />
      {localeNativeLabel(locale)}
      {required ? <span className="text-xs text-red-600">*</span> : null}
      {done ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : null}
    </TabsTrigger>
  );
}
