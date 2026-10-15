'use client';

import { useState } from 'react';
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
import { YoutubeRowsEditor, extractYoutubeId, type YoutubeRow } from '../../_components/YoutubeRowsEditor';
import { dt, dtx } from "@/lib/dashboard/i18n";

export const COURSE_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', get label() { return dt("العنوان"); } },
  { name: 'description', get label() { return dt("الوصف"); }, multiline: true },
];

export const COURSE_KIND_LABELS: Record<string, string> = { get COURSE() { return dt("دورة"); }, get SEMINAR() { return dt("ندوة"); } };

export interface CourseFormValues {
  slug: string;
  title: string;
  description: string;
  kind: string;
  coverImage: string;
  introVideoId: string;
  introVideoUrl: string;
  unitsCount: string;
  isPinned: boolean;
  isExternal: boolean;
  externalUrl: string;
  hasDetailPage: boolean;
  isActive: boolean;
  translations: TranslationMap;
  videos: YoutubeRow[];
}

export function emptyCourse(): CourseFormValues {
  return {
    slug: '',
    title: '',
    description: '',
    kind: 'COURSE',
    coverImage: '',
    introVideoId: '',
    introVideoUrl: '',
    unitsCount: '',
    isPinned: false,
    isExternal: false,
    externalUrl: '',
    hasDetailPage: false,
    isActive: true,
    translations: emptyTranslations(COURSE_TRANSLATION_FIELDS),
    videos: [],
  };
}

export function CourseForm({
  mode,
  courseId,
  initial,
}: {
  mode: 'create' | 'edit';
  courseId?: string;
  initial: CourseFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CourseFormValues>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CourseFormValues>(key: K, v: CourseFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  /* Pasting a YouTube URL as the intro id extracts the id and fills the URL,
     the same convenience the video rows editor offers. */
  const setIntroId = (raw: string) => {
    const id = extractYoutubeId(raw);
    setValues((prev) => ({
      ...prev,
      introVideoId: id,
      introVideoUrl: prev.introVideoUrl && !prev.introVideoUrl.includes(prev.introVideoId)
        ? prev.introVideoUrl
        : id ? `https://www.youtube.com/watch?v=${id}` : '',
    }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error(dt("العنوان بالعربية مطلوب"));
    if (!values.slug.trim()) return toast.error(dt("المعرّف (slug) مطلوب"));
    if (values.isExternal && !values.externalUrl.trim()) return toast.error(dt("الدورة الخارجية تحتاج رابطًا"));

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
        kind: values.kind,
        coverImage: values.coverImage,
        introVideoId: values.introVideoId.trim(),
        introVideoUrl: values.introVideoUrl.trim(),
        unitsCount: values.unitsCount.trim() ? Number(values.unitsCount) : null,
        isPinned: values.isPinned,
        isExternal: values.isExternal,
        externalUrl: values.externalUrl.trim(),
        hasDetailPage: values.hasDetailPage,
        isActive: values.isActive,
        translations: values.translations,
        videos: values.videos.map((v) => ({
          youtubeId: v.youtubeId.trim(),
          url: v.url.trim(),
          thumbnail: v.thumbnail.trim(),
          title: v.title.trim(),
        })),
      };

      if (mode === 'create') {
        await axios.post('/api/courses', payload);
        toast.success(dt("تم إنشاء الدورة"));
      } else {
        await axios.put(`/api/courses/${courseId}`, payload);
        toast.success(dt("تم حفظ الدورة"));
      }
      router.push('/dashboard/courses');
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
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/courses')}>
          <ArrowRight className="w-4 h-4 me-1" />
          {dt("رجوع")}</Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? dt("دورة جديدة") : dt("تعديل الدورة")}</h1>
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
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">{dt("الوصف (بالعربية)")}</span>
            <Textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("النوع")}</span>
            <Select value={values.kind} onValueChange={(v) => set('kind', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COURSE_KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("فيديو التعريف (معرّف يوتيوب)")}</span>
            <Input
              dir="ltr"
              placeholder={dt("الصق الرابط أو المعرّف")}
              value={values.introVideoId}
              onChange={(e) => setIntroId(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("رابط فيديو التعريف")}</span>
            <Input dir="ltr" value={values.introVideoUrl} onChange={(e) => set('introVideoUrl', e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">{dt("عدد الوحدات")}</span>
            <Input
              dir="ltr"
              type="number"
              min={0}
              value={values.unitsCount}
              onChange={(e) => set('unitsCount', e.target.value)}
            />
          </label>
        </div>

        <ImageUploadField
          label={dt("صورة الغلاف")}
          value={values.coverImage}
          onChange={(url) => set('coverImage', url)}
          previewClass="w-40 h-24"
        />

        <div className="rounded-lg border p-3 space-y-3 bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-600">{dt("شكل الدورة")}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2">
              <Switch checked={values.hasDetailPage} onCheckedChange={(v) => set('hasDetailPage', v)} />
              <span className="text-sm">{dt("لها صفحة تفاصيل")}</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={values.isExternal} onCheckedChange={(v) => set('isExternal', v)} />
              <span className="text-sm">{dt("مستضافة خارجيًا")}</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={values.isPinned} onCheckedChange={(v) => set('isPinned', v)} />
              <span className="text-sm">{dt("مثبّتة في الرئيسية")}</span>
            </label>
          </div>
          {values.isExternal ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">{dt("الرابط الخارجي *")}</span>
              <Input
                dir="ltr"
                placeholder="https://..."
                value={values.externalUrl}
                onChange={(e) => set('externalUrl', e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <label className="flex items-center gap-2">
          <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <span className="text-sm">{dt("مفعّلة")}</span>
        </label>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{dt("فيديوهات الدورة")}</h2>
          <span className="text-xs text-slate-500">{dtx("{0} فيديو", [values.videos.length])}</span>
        </div>
        <YoutubeRowsEditor
          rows={values.videos}
          onChange={(next) => set('videos', next)}
          showDuration={false}
          showActive={false}
          addLabel={dt("إضافة فيديو")}
        />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{dt("الترجمات")}</h2>
          <span className="text-xs text-slate-500">{dtx("{0} لغة مترجمة", [translated])}</span>
        </div>
        <ContentTranslationTabs
          fields={COURSE_TRANSLATION_FIELDS}
          source={{ title: values.title, description: values.description }}
          itemLabel="course"
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
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/courses')}>
          {dt("إلغاء")}</Button>
      </div>
    </form>
  );
}
