'use client';

import ReactCountryFlag from 'react-country-flag';
import { Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import { localeFlag, localeNativeLabel } from './locale-form';

/**
 * "Show this list in …" — the language a dashboard listing displays its
 * titles in. A select rather than a tab strip: nineteen tabs do not fit a
 * card header, and the choice is made once, not toggled while scanning.
 */
export function DashboardLocaleSwitcher({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (locale: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'h-9 w-full sm:w-[200px]'} aria-label="لغة العرض">
        <Languages className="ml-1 h-4 w-4 shrink-0 text-slate-500" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem key={locale} value={locale}>
            <span className="inline-flex items-center gap-2">
              <ReactCountryFlag countryCode={localeFlag(locale)} svg style={{ width: '1em', height: '1em' }} />
              {localeNativeLabel(locale)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
