'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { ArrowLeft, Loader2, Upload, X } from 'lucide-react';
import { LocaleFormTabs, collectLocaleTranslations, type LocaleFormField } from '../../_components/LocaleFormTabs';
import {
  CategoryPageSection,
  emptyCategoryPage,
  emptyCategoryValue,
  emptyCategoryCard,
  parseAmountList,
  currencyRowsToMap,
  donateTargetPayload,
  CATEGORY_VALUE_TRANSLATION_FIELDS,
  CATEGORY_CARD_TRANSLATION_FIELDS,
  type CategoryPageValues,
} from '../_components/CategoryPageSection';
import { translationsFromRows } from '../../_components/ContentTranslationTabs';
import type { ContentOption } from '../../super-categories/_components/ContentPicker';
import { TRANSLATION_LOCALES, localeDefaults, localeKey, type TranslationLocale } from '../../_components/locale-form';
import { CategoryIconPicker } from '../_components/CategoryIconPicker';

const LOCALE_FIELDS: readonly LocaleFormField[] = [
  { name: 'name', label: 'اسم الحملة', maxLength: 50, requiredIn: ['en'] },
  { name: 'description', label: 'الوصف', multiline: true, maxLength: 500 },
  /* The landing page's own copy. Translated like the rest, so the auto-translate
     button fills the whole page in one press. */
  { name: 'heroLead', label: 'مقدمة الصفحة', multiline: true },
  { name: 'ctaLabel', label: 'زر الواجهة' },
  { name: 'statDoneLabel', label: 'وصف الرقم المُنجز' },
  { name: 'statGoalLabel', label: 'وصف رقم الهدف' },
  { name: 'projectsTitle', label: 'عنوان قسم المشاريع' },
  { name: 'donateTitle', label: 'عنوان صندوق التبرع' },
  { name: 'donateNote', label: 'ملاحظة صندوق التبرع' },
  { name: 'achievementsTitle', label: 'عنوان قسم الإنجازات' },
];
const LOCALE_FIELD_NAMES = ['name', 'description', 'heroLead', 'ctaLabel', 'statDoneLabel', 'statGoalLabel', 'projectsTitle', 'donateTitle', 'donateNote', 'achievementsTitle'] as const;
type LocaleShape = { [K in `${(typeof LOCALE_FIELD_NAMES)[number]}_${TranslationLocale}`]: z.ZodOptional<z.ZodString> };
const LOCALE_SHAPE = Object.fromEntries(
  TRANSLATION_LOCALES.flatMap((locale) => [
    [localeKey('name', locale), z.string().max(50).optional()],
    [localeKey('description', locale), z.string().max(500).optional()],
  ])
) as LocaleShape;

const formSchema = z.object({
  name: z.string().min(1, 'اسم الحملة مطلوب').max(50, 'اسم الحملة طويل جداً'),
  description: z.string().max(500, 'الوصف طويل جداً').optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  /* name/description per translation locale, generated from the locale list;
     English is required — see superRefine. */
  ...LOCALE_SHAPE,
}).superRefine((data, ctx) => {
  if (!data.name_en || !String(data.name_en).trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'English name is required', path: ['name_en'] });
  }
});

type FormValues = z.infer<typeof formSchema>;

export default function NewCategoryPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [page, setPage] = useState<CategoryPageValues>(emptyCategoryPage());

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      icon: '',
      ...localeDefaults(LOCALE_FIELD_NAMES),
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      await axios.post('/api/categories', {
        name: values.name,
        description: values.description,
        image: values.image,
        icon: values.icon,
        heroImage: page.heroImage,
        heroVideoUrl: page.heroVideoUrl,
        statDoneValue: page.statDoneValue === '' ? null : Number(page.statDoneValue),
        statGoalValue: page.statGoalValue === '' ? null : Number(page.statGoalValue),
        suggestedAmounts: parseAmountList(page.suggestedAmounts),
        suggestedByCurrency: currencyRowsToMap(page.suggestedByCurrency),
        ...donateTargetPayload(page.donateTarget),
        achievementVideoIds: page.achievementVideoIds,
        values: page.values.filter((v) => v.label.trim()),
        infoCards: page.infoCards.filter((c) => c.title.trim()),
        translations: collectLocaleTranslations(values, LOCALE_FIELDS),
      });
      toast.success('تم إنشاء الحملة بنجاح');
      router.push('/dashboard/categories');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('فشل في إنشاء الحملة');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload', formData);
      form.setValue('image', response.data.url);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('فشل في رفع الصورة');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async () => {
    const imageUrl = form.getValues('image');
    if (!imageUrl) return;

    try {
      const publicId = imageUrl.split('/').slice(-1)[0].split('.')[0];
      if (publicId) {
        await axios.delete(`/api/upload?publicId=${publicId}`);
      }
      form.setValue('image', '');
      toast.success('تم حذف الصورة بنجاح');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('فشل في حذف الصورة');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">إنشاء حملة جديدة</h1>
          <p className="text-gray-600">قم بإدخال معلومات الحملة</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/categories')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          العودة
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <LocaleFormTabs
            form={form}
            fields={LOCALE_FIELDS}
            itemLabel="campaign category"
            arabic={
              <Card className="p-6">
                <div className="grid gap-6">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>اسم الحملة</FormLabel><FormControl><Input {...field} placeholder="أدخل اسم الحملة" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>وصف الحملة</FormLabel><FormControl><Textarea placeholder="اكتب وصفاً للحملة..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </Card>
            }
          />

          {/* A new category has no campaigns yet, so the donation box's target
              is chosen after the first one is filed under it. */}
          <CategoryPageSection values={page} onChange={setPage} campaignOptions={[]} />

          <Card className="p-6">
            <div className="grid gap-6">

              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>صورة الحملة</FormLabel>
                    <FormControl>
                      <div className="space-y-4">
                        {field.value ? (
                          <div className="relative w-40 h-40">
                            <img
                              src={field.value}
                              alt="Category"
                              className="w-full h-full object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={removeImage}
                              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                              id="image"
                              disabled={uploadingImage}
                            />
                            <label
                              htmlFor="image"
                              className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors"
                            >
                              {uploadingImage ? (
                                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="mt-2 text-sm text-gray-500">
                                    اضغط لإضافة صورة
                                  </span>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      يمكنك رفع صورة واحدة للحملة.
                      <br />
                      <span className="text-amber-700">
                        الحجم المُوصى به: <strong>1200×800 px</strong> (نسبة 3:2)، صيغة JPG أو PNG، حجم الملف لا يزيد عن 2MB.
                      </span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Icon Picker */}
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أيقونة الحملة</FormLabel>
                    <FormControl>
                      <CategoryIconPicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormDescription>اختر أيقونة جاهزة أو علم أي دولة.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/categories')}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              className="bg-brand hover:bg-brand-dark"
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إنشاء الحملة
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
} 