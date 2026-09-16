'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { SUPPORTED_CURRENCY_OPTIONS } from '@/lib/supported-currencies';
import { ImageUploadField } from '../../_components/ImageUploadField';
import {
  ContentTranslationTabs,
  emptyTranslations,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { ContentPicker, type ContentOption } from '../../super-categories/_components/ContentPicker';
import { CategoryIconPicker } from './CategoryIconPicker';
import { iconLabel } from './category-icon-catalog';
import { parseCategoryIcon } from '@/components/CategoryIcon';
import { CategoryCardIcon, isLegacyCardIcon } from '@/components/minbar/categories/CategoryCardIcon';

/**
 * The landing page a category owns, as the dashboard edits it.
 *
 * Every category is published as a project page in the shape of
 * `Minbar/مشروع ترميم منازل القدس.dc.html`. The translated copy — the lead, the
 * figure labels, the headings — lives in the form's language tabs above this
 * section, because it is per-locale; everything here is the page's structure:
 * the images, the numbers, the strip of values, the three explanatory cards,
 * the campaign the donation box gives to, and the achievement videos.
 *
 * Each part is optional. A category with none of it still publishes — as its
 * hero and its campaigns — so this section never has to be filled in to save.
 */

export const CATEGORY_VALUE_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'label', label: 'النص' },
];

export const CATEGORY_CARD_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'body', label: 'النص', multiline: true },
];

/** The cards' original eight drawn glyphs — mirrors `CATEGORY_CARD_ICON_KEYS` on the write side. */
export const CARD_ICON_LABELS: Record<string, string> = {
  alert: 'تنبيه / خطر',
  home: 'منزل',
  heart: 'قلب / أثر',
  hands: 'أيادٍ / تكافل',
  book: 'كتاب / تعليم',
  shield: 'حماية',
  water: 'ماء',
  users: 'أسرة / مجتمع',
};

/** What to call a card's icon — a drawn glyph, a catalogue icon, or a flag. */
function cardIconLabel(icon: string): string {
  if (CARD_ICON_LABELS[icon]) return CARD_ICON_LABELS[icon];
  const parsed = parseCategoryIcon(icon);
  if (parsed.kind === 'flag') {
    try {
      return `علم ${new Intl.DisplayNames(['ar'], { type: 'region' }).of(parsed.countryCode) ?? parsed.countryCode}`;
    } catch {
      return `علم ${parsed.countryCode}`;
    }
  }
  return iconLabel(parsed.name);
}

export interface CategoryValueRow {
  label: string;
  translations: TranslationMap;
}

export interface CategoryCardRow {
  icon: string;
  title: string;
  body: string;
  translations: TranslationMap;
}

/** One per-currency exception to the USD amounts, as the editor types it. */
export interface CurrencyAmountsRow {
  id: string;
  currency: string;
  amountsStr: string;
}

/**
 * The donation box's target, as the select holds it:
 *   ''          → automatic — the first campaign by priority
 *   'category'  → the category itself (the order carries a category item)
 *   <ObjectId>  → that campaign
 */
export const DONATE_TO_CATEGORY = 'category';

export interface CategoryPageValues {
  heroImage: string;
  heroVideoUrl: string;
  statDoneValue: string;
  statGoalValue: string;
  suggestedAmounts: string;
  suggestedByCurrency: CurrencyAmountsRow[];
  donateTarget: string;
  achievementVideoIds: string[];
  values: CategoryValueRow[];
  infoCards: CategoryCardRow[];
}

export function emptyCategoryPage(): CategoryPageValues {
  return {
    heroImage: '',
    heroVideoUrl: '',
    statDoneValue: '',
    statGoalValue: '',
    suggestedAmounts: '',
    suggestedByCurrency: [],
    donateTarget: '',
    achievementVideoIds: [],
    values: [],
    infoCards: [],
  };
}

export function currencyAmountsRow(currency = 'EUR', amountsStr = ''): CurrencyAmountsRow {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, currency, amountsStr };
}

/** `{ EUR: [50, 100] }` → editor rows, in the stored order. */
export function currencyRowsFrom(raw: unknown): CurrencyAmountsRow[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, list]) => Array.isArray(list))
    .map(([currency, list]) => currencyAmountsRow(currency, (list as unknown[]).join(', ')));
}

/** Editor rows → `{ EUR: [50, 100] }`; a row with no currency or no amounts is dropped. */
export function currencyRowsToMap(rows: CurrencyAmountsRow[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const row of rows) {
    const code = row.currency.trim().toUpperCase();
    const list = parseAmountList(row.amountsStr);
    if (code && list.length) out[code] = list;
  }
  return out;
}

/** What the API is sent for the box's target — see `DONATE_TO_CATEGORY`. */
export function donateTargetPayload(target: string): { donateToCategory: boolean; donateCampaignId: string | null } {
  return {
    donateToCategory: target === DONATE_TO_CATEGORY,
    donateCampaignId: target && target !== DONATE_TO_CATEGORY ? target : null,
  };
}

export function emptyCategoryValue(): CategoryValueRow {
  return { label: '', translations: emptyTranslations(CATEGORY_VALUE_TRANSLATION_FIELDS) };
}

export function emptyCategoryCard(icon = 'alert'): CategoryCardRow {
  return { icon, title: '', body: '', translations: emptyTranslations(CATEGORY_CARD_TRANSLATION_FIELDS) };
}

/** `"100, 300, 500"` → `[100, 300, 500]`; the API drops anything ≤ 0 anyway. */
export function parseAmountList(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((v) => Number(v.replace(/[^0-9]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function CategoryPageSection({
  values,
  onChange,
  /** Campaigns of this category, for the donation box's target. */
  campaignOptions,
}: {
  values: CategoryPageValues;
  onChange: (next: CategoryPageValues) => void;
  campaignOptions: ContentOption[];
}) {
  const [achievementOptions, setAchievementOptions] = useState<ContentOption[]>([]);

  /* The achievement videos this page can show. Read once; the picker only
     stores ids, so without this it could not name anything already chosen. */
  useEffect(() => {
    let live = true;
    axios
      .get('/api/super-categories/content-options')
      .then((res) => {
        if (!live) return;
        const all = (res.data?.VIDEO ?? []) as Array<ContentOption & { hint?: string }>;
        setAchievementOptions(all.filter((v) => v.hint === 'ACHIEVEMENT'));
      })
      .catch((e) => { if (live) toast.error(errorMessage(e, 'تعذّر تحميل قائمة الفيديوهات')); });
    return () => { live = false; };
  }, []);

  const set = <K extends keyof CategoryPageValues>(key: K, v: CategoryPageValues[K]) =>
    onChange({ ...values, [key]: v });

  const setValueRow = (index: number, patch: Partial<CategoryValueRow>) =>
    set('values', values.values.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const setCardRow = (index: number, patch: Partial<CategoryCardRow>) =>
    set('infoCards', values.infoCards.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const setCurrencyRow = (id: string, patch: Partial<Pick<CurrencyAmountsRow, 'currency' | 'amountsStr'>>) =>
    set('suggestedByCurrency', values.suggestedByCurrency.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const move = <T,>(list: T[], index: number, delta: number): T[] => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  return (
    <>
      {/* ── Hero & figures ───────────────────────────────────────────── */}
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-bold">صفحة الحملة — الواجهة والأرقام</h2>
          <p className="text-xs text-slate-500">
            تُنشر كل حملة كصفحة مشروع كاملة. النصوص المترجمة (المقدمة، عناوين الأقسام، وصف الأرقام) في تبويبات
            اللغات بالأعلى؛ هنا بنية الصفحة. كل جزء اختياري — الحملة بلا أي منها تظهر بواجهتها ومشاريعها.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ImageUploadField
            label="صورة الواجهة (عريضة، خلف العنوان)"
            value={values.heroImage}
            onChange={(url) => set('heroImage', url)}
            previewClass="w-56 h-32"
          />
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">فيديو الواجهة (رابط يوتيوب أو معرّف)</span>
            <Input dir="ltr" placeholder="https://www.youtube.com/watch?v=..." value={values.heroVideoUrl} onChange={(e) => set('heroVideoUrl', e.target.value)} />
            <span className="block text-[11px] text-slate-500">يظهر بجانب العنوان في الواجهة. اتركه فارغًا ليأخذ النص العرض كاملًا.</span>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">الرقم المُنجز</span>
            <Input dir="ltr" inputMode="numeric" placeholder="45" value={values.statDoneValue} onChange={(e) => set('statDoneValue', e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">رقم الهدف</span>
            <Input dir="ltr" inputMode="numeric" placeholder="100" value={values.statGoalValue} onChange={(e) => set('statGoalValue', e.target.value.replace(/[^0-9]/g, ''))} />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">
          شريط التقدم تحت الرقمين يُحسب منهما. اترك الهدف فارغًا ليختفي شريط الأرقام كله. وصف كل رقم يُكتب في تبويبات اللغات.
        </p>
      </Card>

      {/* ── The donation box ─────────────────────────────────────────── */}
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-bold">صندوق التبرع</h2>
          <p className="text-xs text-slate-500">
            يوجّه الصندوق تبرعه إمّا إلى الحملة نفسها — فيُسجَّل التبرع عليها مباشرة — أو إلى مشروع واحد من مشاريعها.
            «تلقائي» يختار أول مشروع بحسب الأولوية.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">وجهة التبرع</span>
            <Select
              value={values.donateTarget || 'auto'}
              onValueChange={(v) => set('donateTarget', v === 'auto' ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="تلقائي" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={DONATE_TO_CATEGORY}>الحملة نفسها — لا مشروعًا بعينه</SelectItem>
                <SelectItem value="auto">تلقائي — أول مشروع بحسب الأولوية</SelectItem>
                {campaignOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المبالغ المقترحة (جميع العملات)</span>
            <Input dir="ltr" placeholder="100, 200, 300, 500, 700" value={values.suggestedAmounts} onChange={(e) => set('suggestedAmounts', e.target.value)} />
            <span className="block text-[11px] text-slate-500">
              بالدولار، مفصولة بفاصلة؛ تُعرض محوَّلة إلى عملة الزائر ما لم تُضف استثناءً أدناه. اتركها فارغة لاستخدام مبالغ الموقع الافتراضية.
            </span>
          </label>
        </div>

        {/* Per-currency exceptions — the same rows as the campaign form's
            suggested donations, so an editor who knows one knows the other. */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">استثناءات حسب العملة (اختياري)</span>
            <Button type="button" variant="outline" size="sm" onClick={() => set('suggestedByCurrency', [...values.suggestedByCurrency, currencyAmountsRow()])}>
              <Plus className="ml-1 h-4 w-4" />
              إضافة عملة
            </Button>
          </div>
          {values.suggestedByCurrency.length === 0 ? (
            <p className="text-[11px] text-slate-500">بدون استثناءات، تُطبّق المبالغ أعلاه على كل العملات.</p>
          ) : (
            <div className="space-y-3">
              {values.suggestedByCurrency.map((row) => (
                <div key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
                  <div className="min-w-[140px] flex-1 space-y-1">
                    <span className="text-[11px] text-slate-500">العملة</span>
                    <Select value={row.currency} onValueChange={(v) => setCurrencyRow(row.id, { currency: v })}>
                      <SelectTrigger dir="ltr"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_CURRENCY_OPTIONS.filter((c) => c.code !== 'USD').map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex-[2] space-y-1">
                    <span className="text-[11px] text-slate-500">المبالغ لهذه العملة (كما تُعرض، بلا تحويل)</span>
                    <Input dir="ltr" className="font-mono" placeholder="مثال: 50, 100, 200" value={row.amountsStr} onChange={(e) => setCurrencyRow(row.id, { amountsStr: e.target.value })} />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => set('suggestedByCurrency', values.suggestedByCurrency.filter((r) => r.id !== row.id))}
                    aria-label="حذف الصف"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── The values strip ─────────────────────────────────────────── */}
      <Card className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">قيم الحملة</h2>
            <p className="text-xs text-slate-500">عبارات قصيرة تظهر في شريط مربعات أعلى المشاريع. الأفضل خمس أو أقل.</p>
          </div>
          <Badge variant="outline">{values.values.length}</Badge>
        </div>

        {values.values.map((row, index) => (
          <div key={index} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{index + 1}</Badge>
              <Input className="h-8 flex-1 text-xs" placeholder="نحمي الوجود ونعزز الصمود" value={row.label} onChange={(e) => setValueRow(index, { label: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('values', move(values.values, index, -1))} aria-label="أعلى">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('values', move(values.values, index, 1))} aria-label="أسفل">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('values', values.values.filter((_, i) => i !== index))} aria-label="حذف">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            <details className="rounded border bg-slate-50/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-600">ترجمات هذه العبارة</summary>
              <div className="pt-2">
                <ContentTranslationTabs
                  fields={CATEGORY_VALUE_TRANSLATION_FIELDS}
                  requiredField="label"
                  value={row.translations}
                  onChange={(next) => setValueRow(index, { translations: next })}
                  source={{ label: row.label }}
                  itemLabel="campaign value statement"
                />
              </div>
            </details>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={() => set('values', [...values.values, emptyCategoryValue()])}>
          <Plus className="ml-1 h-4 w-4" />
          إضافة قيمة
        </Button>
      </Card>

      {/* ── The explanatory cards ────────────────────────────────────── */}
      <Card className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">بطاقات التعريف</h2>
            <p className="text-xs text-slate-500">ثلاث بطاقات أسفل الصفحة — لماذا، وماذا نفعل، والأثر. لكل واحدة أيقونة مرسومة.</p>
          </div>
          <Badge variant="outline">{values.infoCards.length}</Badge>
        </div>

        {values.infoCards.map((row, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{index + 1}</Badge>
              <span className="inline-flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs text-slate-700">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-amber-50 text-amber-600">
                  <CategoryCardIcon name={row.icon} className="h-4 w-4" />
                </span>
                {cardIconLabel(row.icon)}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('infoCards', move(values.infoCards, index, -1))} aria-label="أعلى">
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('infoCards', move(values.infoCards, index, 1))} aria-label="أسفل">
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set('infoCards', values.infoCards.filter((_, i) => i !== index))} aria-label="حذف">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            <Input className="h-8 text-xs" placeholder="لماذا هذه الحملة؟" value={row.title} onChange={(e) => setCardRow(index, { title: e.target.value })} />
            <Textarea rows={3} className="text-xs" placeholder="نص البطاقة…" value={row.body} onChange={(e) => setCardRow(index, { body: e.target.value })} />
            {/* The same picker as the category's own icon, so a card can carry
                any of its icons or a flag. The first eight drawn glyphs stay
                available above for the cards that already use them. */}
            <details className="rounded border bg-slate-50/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-600">تغيير الأيقونة</summary>
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CARD_ICON_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      onClick={() => setCardRow(index, { icon: value })}
                      className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${
                        row.icon === value ? 'border-amber-500 bg-amber-50 text-amber-600' : 'border-slate-200 text-slate-500 hover:border-amber-400'
                      }`}
                    >
                      <CategoryCardIcon name={value} className="h-4 w-4" />
                    </button>
                  ))}
                </div>
                <CategoryIconPicker
                  value={isLegacyCardIcon(row.icon) ? '' : row.icon}
                  onChange={(v) => setCardRow(index, { icon: v || 'alert' })}
                />
              </div>
            </details>
            <details className="rounded border bg-slate-50/60 p-2">
              <summary className="cursor-pointer text-[11px] font-bold text-slate-600">ترجمات هذه البطاقة</summary>
              <div className="pt-2">
                <ContentTranslationTabs
                  fields={CATEGORY_CARD_TRANSLATION_FIELDS}
                  requiredField="title"
                  value={row.translations}
                  onChange={(next) => setCardRow(index, { translations: next })}
                  source={{ title: row.title, body: row.body }}
                  itemLabel="explanatory card on a campaign page"
                />
              </div>
            </details>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={() => set('infoCards', [...values.infoCards, emptyCategoryCard()])}>
          <Plus className="ml-1 h-4 w-4" />
          إضافة بطاقة
        </Button>
      </Card>

      {/* ── Achievements ─────────────────────────────────────────────── */}
      <Card className="space-y-3 p-6">
        <div>
          <h2 className="text-sm font-bold">الإنجازات بالفيديو</h2>
          <p className="text-xs text-slate-500">
            من مكتبة الفيديوهات — نوع «الإنجازات». تظهر في شريط أسفل الصفحة بالترتيب المحدد هنا، بنفس شكل شريط الإنجازات
            في الصفحة الرئيسية. فيديو يُحذف أو يُخفى يسقط من الشريط تلقائيًا.
          </p>
        </div>
        <ContentPicker
          label="الفيديوهات"
          description="اختر ما يخص هذه الحملة."
          options={achievementOptions}
          value={values.achievementVideoIds}
          onChange={(next) => set('achievementVideoIds', next)}
        />
      </Card>
    </>
  );
}
