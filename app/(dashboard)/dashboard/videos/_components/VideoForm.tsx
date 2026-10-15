'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowRight, Loader2, Upload, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';
import { LOCALES, SUPPORTED_LOCALES } from '@/lib/locales';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';
import { dt, dtx } from "@/lib/dashboard/i18n";

/** Videos translate their title only. */
export const VIDEO_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', get label() { return dt("العنوان"); } },
];

/** Mirrors the VideoType enum; the label is what the section is called on the site. */
export const VIDEO_TYPE_LABELS: Record<string, string> = {
  get ACHIEVEMENT() { return dt("إنجازاتنا"); },
  get ENDORSEMENT() { return dt("تزكياتنا"); },
  get FIELD() { return dt("من الميدان"); },
  get EVENT() { return dt("فعالياتنا"); },
};

export interface VideoFormValues {
  slug: string;
  type: string;
  title: string;
  youtubeId: string;
  url: string;
  startSeconds: string;
  thumbnail: string;
  regionKey: string;
  localeFilter: string[];
  showOnHome: boolean;
  isActive: boolean;
  translations: TranslationMap;
}

export function emptyVideo(): VideoFormValues {
  return {
    slug: '',
    type: 'ACHIEVEMENT',
    title: '',
    youtubeId: '',
    url: '',
    startSeconds: '',
    thumbnail: '',
    regionKey: '',
    localeFilter: [],
    showOnHome: false,
    isActive: true,
    translations: emptyTranslations(VIDEO_TRANSLATION_FIELDS),
  };
}

export function VideoForm({
  mode,
  videoId,
  initial,
}: {
  mode: 'create' | 'edit';
  videoId?: string;
  initial: VideoFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<VideoFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof VideoFormValues>(key: K, v: VideoFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const toggleLocale = (locale: string) =>
    setValues((prev) => ({
      ...prev,
      localeFilter: prev.localeFilter.includes(locale)
        ? prev.localeFilter.filter((l) => l !== locale)
        : [...prev.localeFilter, locale],
    }));

  const uploadThumb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/upload', fd);
      set('thumbnail', res.data.url);
    } catch (err) {
      toast.error(errorMessage(err, dt("تعذّر رفع الصورة")));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error(dt("العنوان بالعربية مطلوب"));
    if (!values.slug.trim()) return toast.error(dt("المعرّف (slug) مطلوب"));
    /* Matches the API rule: a video with neither an id nor a URL renders as an
       empty frame, so catch it here before a round trip. */
    if (!values.youtubeId.trim() && !values.url.trim()) {
      return toast.error(dt("أدخل معرّف يوتيوب أو رابط الفيديو"));
    }

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        type: values.type,
        title: values.title.trim(),
        youtubeId: values.youtubeId.trim(),
        url: values.url.trim(),
        startSeconds: values.startSeconds.trim() ? Number(values.startSeconds) : null,
        thumbnail: values.thumbnail,
        regionKey: values.regionKey.trim(),
        localeFilter: values.localeFilter,
        showOnHome: values.showOnHome,
        isActive: values.isActive,
        translations: values.translations,
      };

      if (mode === 'create') {
        await axios.post('/api/videos', payload);
        toast.success(dt("تم إنشاء الفيديو"));
      } else {
        await axios.put(`/api/videos/${videoId}`, payload);
        toast.success(dt("تم حفظ الفيديو"));
      }
      router.push('/dashboard/videos');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, mode === 'create' ? dt("فشل في الإنشاء") : dt("فشل في الحفظ")));
    } finally {
      setSaving(false);
    }
  };

  const translated = filledLocaleCount(values.translations, 'title');

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/videos')}>
          <ArrowRight className="w-4 h-4 me-1" />
          {dt("رجوع")}</Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? dt("فيديو جديد") : dt("تعديل الفيديو")}</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("العنوان (بالعربية) *")}</span>
            <Input value={values.title} onChange={(e) => set('title', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("المعرّف (slug) *")}</span>
            <Input dir="ltr" value={values.slug} onChange={(e) => set('slug', e.target.value)} />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("القسم *")}</span>
            <Select value={values.type} onValueChange={(v) => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VIDEO_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("مفتاح المنطقة")}</span>
            <Input
              dir="ltr"
              placeholder="gaza"
              value={values.regionKey}
              onChange={(e) => set('regionKey', e.target.value)}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("معرّف يوتيوب")}</span>
            <Input
              dir="ltr"
              placeholder="dQw4w9WgXcQ"
              value={values.youtubeId}
              onChange={(e) => set('youtubeId', e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("رابط الفيديو")}</span>
            <Input
              dir="ltr"
              placeholder="https://youtu.be/..."
              value={values.url}
              onChange={(e) => set('url', e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("يبدأ من (ثانية)")}</span>
            <Input
              dir="ltr"
              type="number"
              min={0}
              value={values.startSeconds}
              onChange={(e) => set('startSeconds', e.target.value)}
            />
          </label>
        </div>

        <p className="text-xs text-slate-500">
          {dt("أدخل معرّف يوتيوب أو رابطًا  أحدهما مطلوب على الأقل.")}</p>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">{dt("صورة مصغّرة")}</span>
          {values.thumbnail ? (
            <div className="relative w-40">
              {/* Sources include Drive thumbnails and YouTube stills, which
                  next/image would need configured hosts for. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={values.thumbnail} alt="" className="w-40 h-24 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => set('thumbnail', '')}
                className="absolute top-1 start-1 p-1 bg-red-500 text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-sm">{dt("رفع صورة")}</span>
              <input type="file" accept="image/*" className="hidden" onChange={uploadThumb} />
            </label>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">{dt("اللغات التي يظهر فيها")}</span>
          <p className="text-xs text-slate-500">
            {dt("اتركها فارغة ليظهر في كل اللغات. حدّد لغات لقصره عليها  مثل التزكيات التركية.")}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUPPORTED_LOCALES.map((locale) => {
              const on = values.localeFilter.includes(locale);
              return (
                <button
                  key={locale}
                  type="button"
                  onClick={() => toggleLocale(locale)}
                  className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                    on
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {LOCALES[locale].nativeLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={values.showOnHome} onCheckedChange={(v) => set('showOnHome', v)} />
            <span className="text-sm">{dt("يظهر في الصفحة الرئيسية")}</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
            <span className="text-sm">{dt("مفعّل")}</span>
          </label>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{dt("الترجمات")}</h2>
          <span className="text-xs text-slate-500">{dtx("{0} لغة مترجمة", [translated])}</span>
        </div>
        <ContentTranslationTabs
          fields={VIDEO_TRANSLATION_FIELDS}
          source={{ title: values.title }}
          itemLabel="video"
          requiredField="title"
          value={values.translations}
          onChange={(next) => set('translations', next)}
        />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
          {mode === 'create' ? dt("إنشاء") : dt("حفظ")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/videos')}>
          {dt("إلغاء")}</Button>
      </div>
    </form>
  );
}
