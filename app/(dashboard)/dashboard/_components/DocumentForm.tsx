'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ArrowRight, FileText, Loader2, Upload, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';
import { validateDocumentFile } from '@/lib/uploads/document-file-rules';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from './ContentTranslationTabs';

/**
 * The shared editor for the two document sections, reports and booklets.
 *
 * They are the same row with one difference — a report carries a publication
 * year — so they share a form rather than duplicating it. `showYear` is the
 * only branch; everything else is labels and the endpoint.
 */

export const DOCUMENT_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'description', label: 'الوصف', multiline: true },
];

export interface DocumentFormValues {
  slug: string;
  title: string;
  description: string;
  fileUrl: string;
  coverImage: string;
  /** Kept as a string so an empty input stays empty rather than becoming 0. */
  year: string;
  isPublished: boolean;
  translations: TranslationMap;
}

export function emptyDocument(): DocumentFormValues {
  return {
    slug: '',
    title: '',
    description: '',
    fileUrl: '',
    coverImage: '',
    year: '',
    isPublished: true,
    translations: emptyTranslations(DOCUMENT_TRANSLATION_FIELDS),
  };
}

export interface DocumentSectionCopy {
  /** Plural section name, e.g. "التقارير". */
  section: string;
  /** Singular, used in headings and toasts, e.g. "التقرير". */
  singular: string;
  /** API base, e.g. "/api/reports". */
  endpoint: string;
  /** Dashboard base, e.g. "/dashboard/reports". */
  basePath: string;
  showYear: boolean;
}

export function DocumentForm({
  mode,
  documentId,
  initial,
  copy,
}: {
  mode: 'create' | 'edit';
  documentId?: string;
  initial: DocumentFormValues;
  copy: DocumentSectionCopy;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DocumentFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const set = <K extends keyof DocumentFormValues>(key: K, v: DocumentFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/upload', fd);
      set('coverImage', res.data.url);
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر رفع الصورة'));
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  /* PDFs go to their own endpoint: /api/upload pins Cloudinary to
     resource_type 'image', which mangles a document. */
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejection = validateDocumentFile(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/upload/document', fd);
      set('fileUrl', res.data.url);
      toast.success('تم رفع الملف');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر رفع الملف'));
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) return toast.error('العنوان بالعربية مطلوب');
    if (!values.slug.trim()) return toast.error('المعرّف (slug) مطلوب');
    if (!values.fileUrl.trim()) return toast.error('ملف PDF مطلوب');

    setSaving(true);
    try {
      const payload = {
        slug: values.slug.trim(),
        title: values.title.trim(),
        description: values.description.trim(),
        fileUrl: values.fileUrl.trim(),
        coverImage: values.coverImage,
        ...(copy.showYear ? { year: values.year.trim() ? Number(values.year) : null } : {}),
        isPublished: values.isPublished,
        translations: values.translations,
      };

      if (mode === 'create') {
        await axios.post(copy.endpoint, payload);
        toast.success(`تم إنشاء ${copy.singular}`);
      } else {
        await axios.put(`${copy.endpoint}/${documentId}`, payload);
        toast.success(`تم حفظ ${copy.singular}`);
      }
      router.push(copy.basePath);
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
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push(copy.basePath)}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">
          {mode === 'create' ? `${copy.singular} جديد` : `تعديل ${copy.singular}`}
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
          {copy.showYear ? (
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">السنة</span>
              <Input
                dir="ltr"
                type="number"
                min={1900}
                max={2200}
                placeholder="2026"
                value={values.year}
                onChange={(e) => set('year', e.target.value)}
              />
            </label>
          ) : null}
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-slate-600">الوصف (بالعربية)</span>
            <Textarea
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">ملف PDF *</span>
          {values.fileUrl ? (
            <div className="flex items-center gap-2 rounded-lg border p-2 w-fit">
              <FileText className="w-4 h-4 text-slate-500" />
              <a
                href={values.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="text-xs text-blue-600 underline max-w-[24rem] truncate"
              >
                {values.fileUrl}
              </a>
              <button
                type="button"
                onClick={() => set('fileUrl', '')}
                className="p-1 bg-red-500 text-white rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-2 w-fit px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50">
                {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-sm">رفع ملف PDF</span>
                <input type="file" accept="application/pdf" className="hidden" onChange={uploadFile} />
              </label>
              {/* A URL field alongside the upload: some documents already live
                  on Drive or another host and need no second copy. */}
              <Input
                dir="ltr"
                placeholder="أو الصق رابط الملف"
                value={values.fileUrl}
                onChange={(e) => set('fileUrl', e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">صورة الغلاف</span>
          {values.coverImage ? (
            <div className="relative w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={values.coverImage} alt="" className="w-32 h-44 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => set('coverImage', '')}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 w-fit px-3 py-2 border rounded-lg cursor-pointer hover:bg-slate-50">
              {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span className="text-sm">رفع صورة</span>
              <input type="file" accept="image/*" className="hidden" onChange={uploadCover} />
            </label>
          )}
        </div>

        <label className="flex items-center gap-2">
          <Switch checked={values.isPublished} onCheckedChange={(v) => set('isPublished', v)} />
          <span className="text-sm">منشور</span>
        </label>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">الترجمات</h2>
          <span className="text-xs text-slate-500">{translated} لغة مترجمة</span>
        </div>
        <ContentTranslationTabs
          fields={DOCUMENT_TRANSLATION_FIELDS}
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
        <Button type="button" variant="outline" onClick={() => router.push(copy.basePath)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
