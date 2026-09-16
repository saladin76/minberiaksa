'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import { LocaleFormTabs, collectLocaleTranslations, type LocaleFormField } from '../../../_components/LocaleFormTabs';
import {
  CategoryPageSection,
  emptyCategoryPage,
  emptyCategoryValue,
  emptyCategoryCard,
  parseAmountList,
  currencyRowsFrom,
  currencyRowsToMap,
  donateTargetPayload,
  DONATE_TO_CATEGORY,
  CATEGORY_VALUE_TRANSLATION_FIELDS,
  CATEGORY_CARD_TRANSLATION_FIELDS,
  type CategoryPageValues,
} from '../../_components/CategoryPageSection';
import { translationsFromRows } from '../../../_components/ContentTranslationTabs';
import type { ContentOption } from '../../../super-categories/_components/ContentPicker';
import { TRANSLATION_LOCALES, localeDefaults, localeKey, type FormLocale, type TranslationLocale } from '../../../_components/locale-form';
import type { SupportedLocale } from '@/lib/locales';
import { CategoryIconPicker } from '../../_components/CategoryIconPicker';
import { SmartSeoWorkbenchCard } from '../../../_components/SmartSeoWorkbenchCard';
import { SaveStatusNotice, type SaveStatusState } from '../../../_components/SaveStatusNotice';

const LOCALE_FIELDS: readonly LocaleFormField[] = [
  { name: 'name', label: 'اسم الحملة', maxLength: 50 },
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
  order: z.number().optional(),
  ...LOCALE_SHAPE,
});

type FormValues = z.infer<typeof formSchema>;
type SeoLocale = FormLocale;

export default function EditCategoryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeLocale, setActiveLocale] = useState<SeoLocale>('ar');
  const [page, setPage] = useState<CategoryPageValues>(emptyCategoryPage());
  const [campaignOptions, setCampaignOptions] = useState<ContentOption[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatusState | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', description: '', image: '', icon: '', order: 0,
      ...localeDefaults(LOCALE_FIELD_NAMES),
    },
  });

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const response = await axios.get(`/api/categories/${params.id}?allTranslations=true`);
        const category = response.data;
        const getTr = (locale: string) => category.translations?.find((t: { locale: string }) => t.locale === locale);

        /* The landing page this category owns. Child rows come back with their
           own translations, which the editors below edit in place. */
        setPage({
          ...emptyCategoryPage(),
          heroImage: category.heroImage ?? '',
          heroVideoUrl: category.heroVideoUrl ?? '',
          statDoneValue: category.statDoneValue == null ? '' : String(category.statDoneValue),
          statGoalValue: category.statGoalValue == null ? '' : String(category.statGoalValue),
          suggestedAmounts: Array.isArray(category.suggestedAmounts) ? category.suggestedAmounts.join(', ') : '',
          suggestedByCurrency: currencyRowsFrom(category.suggestedByCurrency),
          donateTarget: category.donateToCategory ? DONATE_TO_CATEGORY : (category.donateCampaignId ?? ''),
          achievementVideoIds: Array.isArray(category.achievementVideoIds) ? category.achievementVideoIds : [],
          values: (category.values ?? []).map((v: { label?: string; translations?: Array<Record<string, unknown>> }) => ({
            ...emptyCategoryValue(),
            label: v.label ?? '',
            translations: translationsFromRows(v.translations ?? [], CATEGORY_VALUE_TRANSLATION_FIELDS),
          })),
          infoCards: (category.infoCards ?? []).map((c: { icon?: string; title?: string; body?: string; translations?: Array<Record<string, unknown>> }) => ({
            ...emptyCategoryCard(c.icon ?? 'alert'),
            icon: c.icon ?? 'alert',
            title: c.title ?? '',
            body: c.body ?? '',
            translations: translationsFromRows(c.translations ?? [], CATEGORY_CARD_TRANSLATION_FIELDS),
          })),
        });
        form.reset({
          name: category.name || '',
          description: category.description || '',
          image: category.image || '',
          icon: category.icon || '',
          order: category.order ?? 0,
          ...Object.fromEntries(
            TRANSLATION_LOCALES.flatMap((l) => {
              const t = getTr(l);
              return [[localeKey('name', l), t?.name || ''], [localeKey('description', l), t?.description || '']];
            })
          ),
        });
      } catch (error) {
        console.error('Error fetching category:', error);
        toast.error('فشل في تحميل بيانات الحملة');
        router.push('/dashboard/categories');
      } finally {
        setLoading(false);
      }
    };

    fetchCategory();
  }, [params.id, form, router]);

  /* Which campaigns the donation box may point at — this category's own. */
  useEffect(() => {
    let live = true;
    axios
      .get(`/api/categories/${params.id}/campaigns`, { params: { limit: 200 } })
      .then((res) => {
        if (!live) return;
        const items = (res.data?.items ?? []) as Array<{ id: string; title?: string; slug?: string; isActive?: boolean }>;
        setCampaignOptions(items.map((c) => ({ id: c.id, title: c.title || c.slug || c.id, hint: c.slug ?? '', live: c.isActive !== false })));
      })
      .catch(() => { /* the select simply falls back to "automatic" */ });
    return () => { live = false; };
  }, [params.id]);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    setSaveStatus({ type: 'saving', message: 'جاري حفظ تحديثات الحملة...', detail: 'لا تغادر الصفحة حتى يكتمل الحفظ' });
    try {
      await axios.put(`/api/categories/${params.id}`, {
        name: values.name,
        description: values.description,
        image: values.image,
        icon: values.icon,
        order: values.order,
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
      setSaveStatus({ type: 'success', message: 'تم تحديث الحملة بنجاح', detail: 'أنت ما زلت داخل صفحة التعديل' });
      toast.success('تم تحديث الحملة بنجاح');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating category:', error);
      const message = error?.response?.data?.error || 'فشل في تحديث الحملة';
      setSaveStatus({ type: 'error', message, detail: 'راجع البيانات ثم حاول مرة أخرى' });
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onInvalid = () => {
    const message = 'راجع الحقول المطلوبة أو الحقول التي تجاوزت الحد المسموح';
    setSaveStatus({ type: 'error', message, detail: 'لم يتم إرسال البيانات للحفظ' });
    toast.error(message, { duration: 9000 });
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
      if (publicId) await axios.delete(`/api/upload?publicId=${publicId}`);
      form.setValue('image', '');
      toast.success('تم حذف الصورة بنجاح');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('فشل في حذف الصورة');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  const watchedImage = form.watch('image');
  const imageCount = watchedImage ? 1 : 0;

  const renderSeo = (locale: SeoLocale, title: string, description?: string) => (
    <SmartSeoWorkbenchCard
      key={`category-seo-${params.id}-${locale}`}
      type="category"
      locale={locale}
      title={title || ''}
      description={description || ''}
      imageCount={imageCount}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">تعديل الحملة</h1>
          <p className="text-gray-600">قم بتحديث معلومات الحملة</p>
          <SaveStatusNotice status={saveStatus} />
        </div>
        <Button variant="outline" onClick={() => router.push('/dashboard/categories')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          العودة
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          <LocaleFormTabs
            form={form}
            fields={LOCALE_FIELDS}
            itemLabel="campaign category"
            value={activeLocale}
            onValueChange={(value) => setActiveLocale(value as SeoLocale)}
            arabic={
              <LocaleCard>
                <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>اسم الحملة</FormLabel><FormControl><Input {...field} placeholder="أدخل اسم الحملة" /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>وصف الحملة</FormLabel><FormControl><Textarea placeholder="اكتب وصفاً للحملة..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} />
              </LocaleCard>
            }
            extra={(locale) =>
              locale === 'ar'
                ? renderSeo('ar', form.watch('name'), form.watch('description'))
                : renderSeo(locale as SupportedLocale, String(form.watch(localeKey('name', locale as TranslationLocale)) || ''), String(form.watch(localeKey('description', locale as TranslationLocale)) || ''))
            }
          />

          <CategoryPageSection values={page} onChange={setPage} campaignOptions={campaignOptions} />

          <Card className="p-6"><div className="grid gap-6"><FormField control={form.control} name="image" render={({ field }) => (<FormItem><FormLabel>صورة الحملة</FormLabel><FormControl><div className="space-y-4">{field.value ? (<div className="relative w-40 h-40"><img src={field.value} alt="Category" className="w-full h-full object-cover rounded-lg" /><button type="button" onClick={removeImage} className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"><X className="w-4 h-4" /></button></div>) : (<div className="relative"><input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image" disabled={uploadingImage} /><label htmlFor="image" className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors">{uploadingImage ? (<Loader2 className="w-6 h-6 animate-spin text-brand" />) : (<><Upload className="w-6 h-6 text-gray-400" /><span className="mt-2 text-sm text-gray-500">اضغط لإضافة صورة</span></>)}</label></div>)}</div></FormControl><FormDescription>يمكنك رفع صورة واحدة للحملة.<br /><span className="text-amber-700">الحجم المُوصى به: <strong>1200×800 px</strong> (نسبة 3:2)، صيغة JPG أو PNG، حجم الملف لا يزيد عن 2MB.</span></FormDescription><FormMessage /></FormItem>)} /><FormField control={form.control} name="icon" render={({ field }) => (<FormItem><FormLabel>أيقونة الحملة</FormLabel><FormControl><CategoryIconPicker value={field.value} onChange={field.onChange} /></FormControl><FormDescription>اختر أيقونة جاهزة أو علم أي دولة.</FormDescription><FormMessage /></FormItem>)} /></div></Card>

          <div className="flex justify-end gap-4"><Button type="button" variant="outline" onClick={() => router.push('/dashboard/categories')}>إلغاء</Button><Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}حفظ التغييرات</Button></div>
        </form>
      </Form>
    </div>
  );
}

function LocaleCard({ children }: { children: React.ReactNode }) {
  return <Card className="p-6"><div className="grid gap-6">{children}</div></Card>;
}
