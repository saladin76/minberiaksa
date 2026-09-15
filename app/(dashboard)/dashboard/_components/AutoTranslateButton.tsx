'use client';

import { useState } from 'react';
import axios from 'axios';
import { Loader2, WandSparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { SUPPORTED_LOCALES } from '@/lib/locales';

/**
 * "Translate into every language" for a dashboard form.
 *
 * The form hands over its Arabic fields; the button posts them to
 * `/api/admin/content-localization/translate` and hands back one record per
 * locale for the form to merge into its own translation state. Nothing is
 * saved by the button: the editor still reviews the tabs and presses the
 * form's own save, so a machine translation never reaches the site unseen.
 *
 * By default only empty fields are filled — an editor's own wording in one
 * language is not thrown away because they asked for the other seventeen.
 * The checkbox opts into replacing everything.
 */

export type TranslatedLocales = Record<string, { fields: Record<string, string>; richFields: Record<string, string> }>;

export function AutoTranslateButton({
  source,
  richSource,
  itemLabel,
  locales,
  onResult,
  size = 'sm',
  disabled,
}: {
  /** Arabic plain-text fields, by field name. */
  source: Record<string, string>;
  /** Arabic Tiptap JSON documents, by field name. */
  richSource?: Record<string, string>;
  /** Shown to the model — "campaign", "FAQ", "story slide"… */
  itemLabel?: string;
  /** Target locales; every non-Arabic locale when omitted. */
  locales?: readonly string[];
  /** Receives the translations and whether existing text may be replaced. */
  onResult: (translations: TranslatedLocales, overwrite: boolean) => void;
  size?: 'sm' | 'default';
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const hasSource =
    Object.values(source).some((v) => v && v.trim()) ||
    Object.values(richSource ?? {}).some((v) => v && v.trim());

  const targets = (locales ?? SUPPORTED_LOCALES.filter((l) => l !== 'ar')) as readonly string[];

  const run = async () => {
    if (!hasSource) return toast.error('اكتب المحتوى بالعربية أولًا');
    setBusy(true);
    try {
      const res = await axios.post('/api/admin/content-localization/translate', {
        fields: source,
        richFields: richSource ?? {},
        locales: targets,
        itemLabel,
      });
      const translations = (res.data?.translations ?? {}) as TranslatedLocales;
      const errors = (res.data?.errors ?? {}) as Record<string, string>;
      onResult(translations, overwrite);
      const done = Object.keys(translations).length;
      const failed = Object.keys(errors).length;
      if (done) toast.success(`تمت ترجمة ${done} لغة${failed ? ` — تعذّرت ${failed}` : ''}. راجع النصوص ثم احفظ.`);
      else toast.error(errorMessage(null, 'لم تُنتج الترجمة أي نص'));
    } catch (e) {
      toast.error(errorMessage(e, 'تعذّرت الترجمة التلقائية'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={run}
        disabled={busy || disabled || !hasSource}
        className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
        title={hasSource ? undefined : 'اكتب المحتوى بالعربية أولًا'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
        {busy ? `جارٍ الترجمة إلى ${targets.length} لغة…` : `ترجمة تلقائية إلى ${targets.length} لغة`}
      </Button>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
        استبدال الترجمات الموجودة
      </label>
    </div>
  );
}

/** Merge helper for forms that keep `{ [locale]: { [field]: string } }`. */
export function mergeTranslations(
  current: Record<string, Record<string, string>>,
  incoming: TranslatedLocales,
  overwrite: boolean,
  fieldNames?: readonly string[]
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = { ...current };
  for (const [locale, t] of Object.entries(incoming)) {
    const row = { ...(next[locale] ?? {}) };
    const merged = { ...t.fields, ...t.richFields };
    for (const [field, value] of Object.entries(merged)) {
      if (fieldNames && !fieldNames.includes(field)) continue;
      if (!overwrite && (row[field] ?? '').trim()) continue;
      row[field] = value;
    }
    next[locale] = row;
  }
  return next;
}
