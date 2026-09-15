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
import { errorMessage } from '@/lib/dashboard/client-error-message';
import {
  ContentTranslationTabs,
  emptyTranslations,
  filledLocaleCount,
  type TranslationField,
  type TranslationMap,
} from '../../_components/ContentTranslationTabs';

/** FAQs translate both halves of the entry. */
export const FAQ_TRANSLATION_FIELDS: readonly TranslationField[] = [
  { name: 'question', label: 'السؤال' },
  { name: 'answer', label: 'الإجابة', multiline: true },
];

export interface FaqFormValues {
  question: string;
  answer: string;
  page: string;
  isActive: boolean;
  translations: TranslationMap;
}

export function emptyFaq(): FaqFormValues {
  return {
    question: '',
    answer: '',
    page: '',
    isActive: true,
    translations: emptyTranslations(FAQ_TRANSLATION_FIELDS),
  };
}

export function FaqForm({
  mode,
  faqId,
  initial,
}: {
  mode: 'create' | 'edit';
  faqId?: string;
  initial: FaqFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FaqFormValues>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FaqFormValues>(key: K, v: FaqFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.question.trim()) return toast.error('السؤال بالعربية مطلوب');
    if (!values.answer.trim()) return toast.error('الإجابة بالعربية مطلوبة');

    setSaving(true);
    try {
      const payload = {
        question: values.question.trim(),
        answer: values.answer.trim(),
        page: values.page.trim(),
        isActive: values.isActive,
        translations: values.translations,
      };

      if (mode === 'create') {
        await axios.post('/api/faqs', payload);
        toast.success('تمت إضافة السؤال');
      } else {
        await axios.put(`/api/faqs/${faqId}`, payload);
        toast.success('تم حفظ السؤال');
      }
      router.push('/dashboard/faqs');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, mode === 'create' ? 'فشل في الإنشاء' : 'فشل في الحفظ'));
    } finally {
      setSaving(false);
    }
  };

  const translated = filledLocaleCount(values.translations, 'question');

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/dashboard/faqs')}>
          <ArrowRight className="w-4 h-4 ml-1" />
          رجوع
        </Button>
        <h1 className="text-lg font-bold">{mode === 'create' ? 'سؤال جديد' : 'تعديل السؤال'}</h1>
      </div>

      <Card className="p-4 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">السؤال (بالعربية) *</span>
          <Input value={values.question} onChange={(e) => set('question', e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">الإجابة (بالعربية) *</span>
          <Textarea rows={5} value={values.answer} onChange={(e) => set('answer', e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">الصفحة</span>
          <Input
            dir="ltr"
            placeholder="donate"
            value={values.page}
            onChange={(e) => set('page', e.target.value)}
          />
          <span className="block text-xs text-slate-500">
            اتركها فارغة ليظهر السؤال في كل الصفحات التي تعرض الأسئلة الشائعة.
          </span>
        </label>

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
          fields={FAQ_TRANSLATION_FIELDS}
          source={{ question: values.question, answer: values.answer }}
          itemLabel="FAQ"
          requiredField="question"
          value={values.translations}
          onChange={(next) => set('translations', next)}
        />
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
          {mode === 'create' ? 'إضافة' : 'حفظ'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/dashboard/faqs')}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
