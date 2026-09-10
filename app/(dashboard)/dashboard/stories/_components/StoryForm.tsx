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
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';

/** Stories translate their title only. */
export const STORY_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
];

export interface StoryFormValues {
  slug: string;
  title: string;
  image: string;
  linkUrl: string;
  isActive: boolean;
  /** ISO strings, or '' for "no limit". */
  startsAt: string;
  endsAt: string;
  translations: TranslationMap;
}

export function emptyStory(): StoryFormValues {
  return {
    slug: '',
    title: '',
    image: '',
    linkUrl: '',
    isActive: true,
    startsAt: '',
    endsAt: '',
    translations: emptyTranslations(STORY_TRANSLATION_FIELDS),
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

export function StoryForm({
  mode,
  storyId,
  initial,
}: {
  mode: 'create' | 'edit';
  storyId?: string;
  initial: StoryFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<StoryFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* An editor who never touches the window gets the 24-hour default the story
     rail assumes. Ticking this posts `endsAt: null`, which the API stores as
     "no limit" rather than as a date far in the future. */
  const [unlimited, setUnlimited] = useState(mode === 'edit' && !initial.endsAt);

  const set = <K extends keyof StoryFormValues>(key: K, v: StoryFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      set('image', res.data.url);
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر رفع الصورة'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error('العنوان بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');
    if (!values.image.trim()) return toast.error('صورة القصة مطلوبة');

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        image: values.image,
        linkUrl: values.linkUrl.trim(),
        isActive: values.isActive,
        startsAt: values.startsAt || null,
        /* Sent explicitly in both directions: the API treats an ABSENT `endsAt`
           as "apply the 24-hour default", so a create that means "unlimited"
           has to say null rather than omit the key. */
        endsAt: unlimited ? null : values.endsAt || null,
        translations: values.translations,
      };

      if (mode === 'create') {
        await axios.post('/api/stories', payload);
        toast.success('تم إنشاء القصة');
      } else {
        await axios.put(`/api/stories/${storyId}`, payload);
        toast.success('تم حفظ القصة');
      }
      router.push('/dashboard/stories');
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
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/stories')}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? 'قصة جديدة' : 'تعديل القصة'}</h1>
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
            <span className="text-xs font-semibold text-slate-600">الرابط عند الضغط</span>
            <Input
              dir="ltr"
              placeholder="/projects#gaza"
              value={values.linkUrl}
              onChange={(e) => set('linkUrl', e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">الصورة *</span>
          {values.image ? (
            <div className="relative w-40">
              {/* Sources include Google Drive thumbnails, which next/image would
                  need configured hosts for — a plain img keeps any URL working. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={values.image} alt="" className="w-40 h-40 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => set('image', '')}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-sm">رفع صورة</span>
              <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
            </label>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">يبدأ في</span>
            <Input
              type="datetime-local"
              value={toLocalInput(values.startsAt)}
              onChange={(e) => set('startsAt', e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">ينتهي في</span>
            <Input
              type="datetime-local"
              disabled={unlimited}
              value={toLocalInput(values.endsAt)}
              onChange={(e) => set('endsAt', e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={unlimited} onCheckedChange={setUnlimited} />
            <span className="text-sm">مدة غير محدودة</span>
            <span className="text-xs text-slate-500">
              (الافتراضي عند الإنشاء: ٢٤ ساعة)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
            <span className="text-sm">مفعّلة</span>
          </label>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={STORY_TRANSLATION_FIELDS}
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
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/stories')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
