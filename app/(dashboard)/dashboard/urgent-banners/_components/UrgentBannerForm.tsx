'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowRight, Loader2 } from 'lucide-react';
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
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { ImageUploadField } from '../../_components/ImageUploadField';
import { LocaleChips } from '../../_components/LocaleChips';

export const BANNER_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'description', label: 'الوصف', multiline: true },
  { name: 'ctaLabel', label: 'نص الزر' },
];

/** Sentinel for the select: Radix refuses an empty-string item value. */
const NO_CAMPAIGN = '__none__';

export interface UrgentBannerFormValues {
  slug: string;
  title: string;
  description: string;
  image: string;
  ctaLabel: string;
  ctaUrl: string;
  campaignId: string;
  /** Comma-separated as typed; parsed server-side. */
  suggestedAmounts: string;
  priority: string;
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
    description: '',
    image: '',
    ctaLabel: '',
    ctaUrl: '',
    campaignId: '',
    suggestedAmounts: '',
    priority: '0',
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

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
        image: values.image,
        ctaLabel: values.ctaLabel.trim(),
        ctaUrl: values.ctaUrl.trim(),
        campaignId: values.campaignId || null,
        suggestedAmounts: values.suggestedAmounts,
        priority: values.priority.trim() ? Number(values.priority) : 0,
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
        <h1 className="text-lg font-bold">{mode === 'create' ? 'بانر طوارئ جديد' : 'تعديل البانر'}</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">العنوان (بالعربية) *</span>
            <Input value={values.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المعرّف (slug) *</span>
            <Input dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">الوصف (بالعربية)</span>
            <Textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </label>

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
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">رابط الزر</span>
            <Input
              dir="ltr"
              placeholder="/projects/gaza-emergency"
              value={values.ctaUrl}
              onChange={(e) => set('ctaUrl', e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">نص الزر (بالعربية)</span>
            <Input placeholder="تبرّع الآن" value={values.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">المبالغ المقترحة</span>
            <Input
              dir="ltr"
              placeholder="25, 50, 100, 250"
              value={values.suggestedAmounts}
              onChange={(e) => set('suggestedAmounts', e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          البانر يحتاج وجهة: حملة مرتبطة أو رابط للزر. تُرتَّب المبالغ المقترحة تصاعديًا عند الحفظ.
        </p>

        <ImageUploadField
          label="الصورة"
          value={values.image}
          onChange={(url) => set('image', url)}
          previewClass="w-48 h-24"
        />

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">الأولوية</span>
            <Input dir="ltr" type="number" value={values.priority} onChange={(e) => set('priority', e.target.value)} />
            <span className="block text-[11px] text-slate-500">الأعلى يظهر أولًا عند تعدد البانرات.</span>
          </label>
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
