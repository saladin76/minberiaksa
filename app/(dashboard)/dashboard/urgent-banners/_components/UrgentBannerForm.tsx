'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import {
  BANNER_PAGES,
  BANNER_TEXT_SIDES,
  BANNER_TONES,
  placementKey,
  type BannerTextSide,
  type BannerTone,
} from '@/lib/minbar/banner-placements';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { ImageUploadField } from '../../_components/ImageUploadField';
import { LocaleChips } from '../../_components/LocaleChips';

/**
 * One banner, as the site draws it (`components/minbar/banners/SiteBanner.tsx`):
 *
 *   ┌ kicker strip (a verse, a slogan) ──────────────────────────────┐
 *   │ [photo]                         [chip 15$ ·مقعد] [750$ ·حافلة] │
 *   │  title                                                         │
 *   │  description                                                   │
 *   │  [primary button]  [secondary button]                          │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * WHERE it shows is `placements` — page × slot pairs from the catalogue; the
 * same banner may sit on several. Its order among the banners of a slot is
 * set by drag-and-drop on the list, not here.
 */

export const BANNER_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'kicker', label: 'الشريط العلوي' },
  { name: 'title', label: 'العنوان' },
  { name: 'description', label: 'الوصف', multiline: true },
  { name: 'ctaLabel', label: 'نص الزر الرئيسي' },
  { name: 'ctaSecondaryLabel', label: 'نص الزر الثانوي' },
  { name: 'amountLabels', label: 'تسميات المبالغ (بنفس ترتيب المبالغ، مفصولة بفاصلة)' },
];

/** Sentinel for the select: Radix refuses an empty-string item value. */
const NO_CAMPAIGN = '__none__';

export interface UrgentBannerFormValues {
  slug: string;
  title: string;
  kicker: string;
  description: string;
  image: string;
  ctaLabel: string;
  ctaUrl: string;
  ctaSecondaryLabel: string;
  ctaSecondaryUrl: string;
  campaignId: string;
  /** Comma-separated as typed; parsed server-side. */
  suggestedAmounts: string;
  amountLabels: string;
  placements: string[];
  tone: BannerTone;
  textSide: BannerTextSide;
  locales: string[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  translations: TranslationMap;
}

export function emptyUrgentBanner(): UrgentBannerFormValues {
  return {
    slug: '',
    title: '',
    kicker: '',
    description: '',
    image: '',
    ctaLabel: '',
    ctaUrl: '',
    ctaSecondaryLabel: '',
    ctaSecondaryUrl: '',
    campaignId: '',
    suggestedAmounts: '',
    amountLabels: '',
    placements: [],
    tone: 'red',
    textSide: 'start',
    locales: [],
    startsAt: '',
    endsAt: '',
    isActive: true,
    translations: emptyTranslations(BANNER_TRANSLATION_FIELDS),
  };
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type CampaignOption = { id: string; title: string };

/** Every campaign, active or not — a banner may point at one being relaunched. */
function useCampaignOptions() {
  const [options, setOptions] = useState<CampaignOption[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: CampaignOption[] = [];
      /* The list API pages at 100; three pages covers this site with room. */
      for (let page = 1; page <= 3; page++) {
        try {
          const res = await axios.get('/api/campaigns', { params: { limit: 100, page, includeInactive: true } });
          const items = (res.data?.items ?? []) as CampaignOption[];
          out.push(...items.map((c) => ({ id: c.id, title: c.title })));
          if (!res.data?.hasMore) break;
        } catch {
          break;
        }
      }
      if (live) setOptions(out);
    })();
    return () => { live = false; };
  }, []);
  return options;
}

const TONE_SWATCH: Record<BannerTone, string> = {
  red: '#A93428',
  navy: '#132C38',
  gold: '#D39A27',
  green: '#1F7A4D',
};

/** Page × slot picker: one row per page, its slots as toggles. */
function PlacementPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="rounded-lg border divide-y">
      {BANNER_PAGES.map((page) => {
        const onCount = page.slots.filter((s) => value.includes(placementKey(page.key, s.key))).length;
        return (
          <div key={page.key} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${page.key === 'all' ? 'bg-amber-50/60' : ''}`}>
            <span className="sm:w-44 shrink-0 text-sm font-semibold text-slate-700 flex items-center gap-2">
              {page.label}
              {onCount > 0 && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">{onCount}</span>}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {page.slots.map((slot) => {
                const key = placementKey(page.key, slot.key);
                const on = value.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                      on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {on && <Check className="w-3 h-3" />}
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UrgentBannerForm({
  mode,
  bannerId,
  initial,
}: {
  mode: 'create' | 'edit';
  bannerId?: string;
  initial: UrgentBannerFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<UrgentBannerFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const campaigns = useCampaignOptions();

  const set = <K extends keyof UrgentBannerFormValues>(key: K, v: UrgentBannerFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error('العنوان بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');
    if (!values.campaignId && !values.ctaUrl.trim()) return toast.error('اربط البانر بحملة أو أدخل رابطًا للزر');
    if (!values.placements.length) return toast.error('اختر مكانًا واحدًا على الأقل يظهر فيه البانر');

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        kicker: values.kicker.trim(),
        description: values.description.trim(),
        image: values.image,
        ctaLabel: values.ctaLabel.trim(),
        ctaUrl: values.ctaUrl.trim(),
        ctaSecondaryLabel: values.ctaSecondaryLabel.trim(),
        ctaSecondaryUrl: values.ctaSecondaryUrl.trim(),
        campaignId: values.campaignId || null,
        suggestedAmounts: values.suggestedAmounts,
        amountLabels: values.amountLabels,
        placements: values.placements,
        tone: values.tone,
        textSide: values.textSide,
        locales: values.locales,
        startsAt: values.startsAt || null,
        endsAt: values.endsAt || null,
        isActive: values.isActive,
        translations: values.translations,
      };

      if (mode === 'create') {
        await axios.post('/api/urgent-banners', payload);
        toast.success('تم إنشاء البانر');
      } else {
        await axios.put(`/api/urgent-banners/${bannerId}`, payload);
        toast.success('تم حفظ البانر');
      }
      router.push('/dashboard/urgent-banners');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, mode === 'create' ? 'فشل في الإنشاء' : 'فشل في الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const translated = filledLocaleCount(values.translations, 'title');

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/urgent-banners')}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? 'بانر جديد' : 'تعديل البانر'}</h1>
      </div>

      {/* ── Copy ─────────────────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-bold">النص (بالعربية)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">العنوان *</span>
            <Input value={values.title} onChange={(e) => set('title', e.target.value)} placeholder="شدّ الرحال إلى الأقصى" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المعرّف (slug) *</span>
            <Input dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">الشريط العلوي</span>
            <Input value={values.kicker} onChange={(e) => set('kicker', e.target.value)} placeholder="آية أو حديث أو شعار قصير يظهر فوق الصورة" />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">الوصف</span>
            <Textarea rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="سطر أو سطران تحت العنوان (اختياري)" />
          </label>
        </div>
      </Card>

      {/* ── Where it leads ──────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-bold">الأزرار والوجهة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">الحملة المرتبطة</span>
            <Select
              value={values.campaignId || NO_CAMPAIGN}
              onValueChange={(v) => set('campaignId', v === NO_CAMPAIGN ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="اختر حملة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CAMPAIGN}>— بدون حملة —</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-[11px] text-slate-500">يُستخدم رابط الحملة بلغة الزائر ما لم تُدخل رابطًا يدويًا.</span>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">رابط الزر الرئيسي</span>
            <Input dir="ltr" placeholder="/projects/gaza-emergency" value={values.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} />
            <span className="block text-[11px] text-slate-500">رابط نسبي يُسبق بلغة الزائر تلقائيًا، أو رابط كامل.</span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">نص الزر الرئيسي</span>
            <Input placeholder="تبرّع الآن" value={values.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
          </label>
          <div className="hidden md:block" />
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">نص الزر الثانوي (اختياري)</span>
            <Input placeholder="تبرّع بمقعد" value={values.ctaSecondaryLabel} onChange={(e) => set('ctaSecondaryLabel', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">رابط الزر الثانوي</span>
            <Input dir="ltr" placeholder="يُترك فارغًا ليأخذ رابط الزر الرئيسي" value={values.ctaSecondaryUrl} onChange={(e) => set('ctaSecondaryUrl', e.target.value)} />
          </label>
        </div>
      </Card>

      {/* ── Look ─────────────────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <h2 className="text-sm font-bold">الشكل</h2>
        <ImageUploadField
          label="الصورة (تُعرض بالأبيض والأسود خلف النص)"
          value={values.image}
          onChange={(url) => set('image', url)}
          previewClass="w-48 h-24"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">اللون</span>
            <div className="flex flex-wrap gap-2">
              {BANNER_TONES.map((t) => {
                const on = values.tone === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set('tone', t.key)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full border border-white/40" style={{ background: TONE_SWATCH[t.key] }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">جهة النص</span>
            <Select value={values.textSide} onValueChange={(v) => set('textSide', v as BannerTextSide)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BANNER_TEXT_SIDES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="block text-[11px] text-slate-500">المبالغ تُثبَّت في الجهة المقابلة للنص.</span>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المبالغ (شرائح السعر، بالدولار)</span>
            <Input dir="ltr" placeholder="15, 750" value={values.suggestedAmounts} onChange={(e) => set('suggestedAmounts', e.target.value)} />
            <span className="block text-[11px] text-slate-500">حتى 4 مبالغ. تُحوَّل لعملة الزائر. اتركها فارغة لإخفاء الشرائح.</span>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">تسميات المبالغ (بنفس الترتيب)</span>
            <Input placeholder="مقعد واحد, حافلة كاملة" value={values.amountLabels} onChange={(e) => set('amountLabels', e.target.value)} />
          </label>
        </div>
      </Card>

      {/* ── Where and when ──────────────────────────────────────────── */}
      <Card className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold">أين يظهر *</h2>
          <p className="text-xs text-slate-500 mt-0.5">اختر الصفحات والمواضع. «كل الصفحات» يضعه في ذلك الموضع من كل صفحة تملكه. ترتيب البانرات داخل الموضع الواحد من صفحة القائمة بالسحب.</p>
        </div>
        <PlacementPicker value={values.placements} onChange={(next) => set('placements', next)} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">يبدأ في</span>
            <Input type="datetime-local" value={toLocalInput(values.startsAt)} onChange={(e) => set('startsAt', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">ينتهي في</span>
            <Input type="datetime-local" value={toLocalInput(values.endsAt)} onChange={(e) => set('endsAt', e.target.value)} />
            <span className="block text-[11px] text-slate-500">اتركه فارغًا ليبقى حتى يُوقف يدويًا.</span>
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">اللغات التي يظهر فيها</span>
          <LocaleChips
            value={values.locales}
            onChange={(next) => set('locales', next)}
            hint="اتركها فارغة ليظهر في كل اللغات."
          />
        </div>

        <label className="flex items-center gap-2">
          <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <span className="text-sm">مفعّل</span>
        </label>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={BANNER_TRANSLATION_FIELDS}
          source={{
            kicker: values.kicker,
            title: values.title,
            description: values.description,
            ctaLabel: values.ctaLabel,
            ctaSecondaryLabel: values.ctaSecondaryLabel,
            amountLabels: values.amountLabels,
          }}
          itemLabel="site banner"
          requiredField="title"
          value={values.translations}
          onChange={(next) => set('translations', next)}
        />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
          {mode === 'create' ? 'إنشاء' : 'حفظ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/urgent-banners')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
