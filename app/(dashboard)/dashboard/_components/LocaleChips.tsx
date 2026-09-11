'use client';

import { LOCALES, SUPPORTED_LOCALES } from '@/lib/locales';

/**
 * A locale allow-list picker for content that is scoped to some languages.
 *
 * Empty means "every locale" for all the models that use it (video
 * `localeFilter`, bank-account and urgent-banner `locales`), so the empty state
 * says so explicitly rather than looking like nothing was chosen.
 */
export function LocaleChips({
  value,
  onChange,
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  hint: string;
}) {
  const toggle = (locale: string) =>
    onChange(value.includes(locale) ? value.filter((l) => l !== locale) : [...value, locale]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SUPPORTED_LOCALES.map((locale) => {
          const on = value.includes(locale);
          return (
            <button
              key={locale}
              type="button"
              onClick={() => toggle(locale)}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                on
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {/* The endonym, not a flag: a language is not a country. */}
              {LOCALES[locale].nativeLabel}
            </button>
          );
        })}
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="px-2.5 py-1 rounded-full text-xs text-slate-500 underline"
          >
            كل اللغات
          </button>
        ) : null}
      </div>
    </div>
  );
}
