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
import { YoutubeRowsEditor, type YoutubeRow } from '../../_components/YoutubeRowsEditor';

export const PLAYLIST_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'description', label: 'الوصف', multiline: true },
];

export const PLAYLIST_KIND_LABELS: Record<string, string> = {
  PROGRAM: 'برنامج',
  SERIES: 'سلسلة',
};

export interface PlaylistFormValues {
  slug: string;
  title: string;
  description: string;
  youtubePlaylistUrl: string;
  kind: string;
  coverImage: string;
  isActive: boolean;
  translations: TranslationMap;
  videos: YoutubeRow[];
}

export function emptyPlaylist(): PlaylistFormValues {
  return {
    slug: '',
    title: '',
    description: '',
    youtubePlaylistUrl: '',
    kind: 'PROGRAM',
    coverImage: '',
    isActive: true,
    translations: emptyTranslations(PLAYLIST_TRANSLATION_FIELDS),
    videos: [],
  };
}

export function PlaylistForm({
  mode,
  playlistId,
  initial,
}: {
  mode: 'create' | 'edit';
  playlistId?: string;
  initial: PlaylistFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PlaylistFormValues>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PlaylistFormValues>(key: K, v: PlaylistFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error('العنوان بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
        youtubePlaylistUrl: values.youtubePlaylistUrl.trim(),
        kind: values.kind,
        coverImage: values.coverImage,
        isActive: values.isActive,
        translations: values.translations,
        /* Posted whole; the API replaces the stored list with exactly this.
           Rows with no id are dropped server-side, so an empty trailing row
           is harmless. */
        videos: values.videos.map((v) => ({
          youtubeId: v.youtubeId.trim(),
          url: v.url.trim(),
          thumbnail: v.thumbnail.trim(),
          title: v.title.trim(),
          durationSeconds: v.durationSeconds.trim() ? Number(v.durationSeconds) : null,
          isActive: v.isActive,
        })),
      };

      if (mode === 'create') {
        await axios.post('/api/playlists', payload);
        toast.success('تم إنشاء قائمة التشغيل');
      } else {
        await axios.put(`/api/playlists/${playlistId}`, payload);
        toast.success('تم حفظ قائمة التشغيل');
      }
      router.push('/dashboard/playlists');
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
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/playlists')}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">
          {mode === 'create' ? 'قائمة تشغيل جديدة' : 'تعديل قائمة التشغيل'}
        </h1>
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
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">النوع</span>
            <Select value={values.kind} onValueChange={(v) => set('kind', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLAYLIST_KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">رابط قائمة يوتيوب</span>
            <Input
              dir="ltr"
              placeholder="https://www.youtube.com/playlist?list=..."
              value={values.youtubePlaylistUrl}
              onChange={(e) => set('youtubePlaylistUrl', e.target.value)}
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">الوصف (بالعربية)</span>
            <Textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </label>
        </div>

        <ImageUploadField
          label="صورة الغلاف"
          value={values.coverImage}
          onChange={(url) => set('coverImage', url)}
          previewClass="w-40 h-24"
        />

        <label className="flex items-center gap-2">
          <Switch checked={values.isActive} onCheckedChange={(v) => set('isActive', v)} />
          <span className="text-sm">مفعّلة</span>
        </label>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الحلقات</h2>
          <span className="text-xs text-slate-500">{values.videos.length} حلقة</span>
        </div>
        <p className="text-xs text-slate-500">
          عناوين الحلقات لا تُترجم: هي ما يعرضه يوتيوب نفسه على الفيديو.
        </p>
        <YoutubeRowsEditor
          rows={values.videos}
          onChange={(next) => set('videos', next)}
          showDuration
          showActive
          addLabel="إضافة حلقة"
        />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={PLAYLIST_TRANSLATION_FIELDS}
          source={{ title: values.title, description: values.description }}
          itemLabel="video playlist"
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
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/playlists')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
