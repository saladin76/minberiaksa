'use client';

import { Languages } from 'lucide-react';

import { cn } from '@/lib/utils';
import { DASH_LOCALE_COOKIE, dt, getDashLocale, type DashLocale } from '@/lib/dashboard/i18n';

/* Each language names itself, so the switch reads the same whatever is active. */
const OPTIONS: ReadonlyArray<{ locale: DashLocale; short: string; label: string }> = [
  { locale: 'ar', short: 'ع', label: 'العربية' },
  { locale: 'en', short: 'EN', label: 'English' },
  { locale: 'tr', short: 'TR', label: 'Türkçe' },
];

/**
 * The dashboard's interface language. Stored in a cookie and applied with a
 * full reload: label tables are read when their modules load, and the server
 * renders the first frame in the chosen language from the same cookie.
 */
export function DashboardLanguageToggle() {
  const active = getDashLocale();

  const choose = (locale: DashLocale) => {
    if (locale === active) return;
    document.cookie = `${DASH_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <div
      role="radiogroup"
      aria-label={dt('لغة لوحة التحكم')}
      className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5"
    >
      <Languages className="mx-1 hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden />
      {OPTIONS.map((option) => {
        const selected = option.locale === active;
        return (
          <button
            key={option.locale}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            lang={option.locale}
            onClick={() => choose(option.locale)}
            className={cn(
              'h-7 min-w-8 rounded-md px-2 text-xs font-semibold transition-colors',
              selected ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
