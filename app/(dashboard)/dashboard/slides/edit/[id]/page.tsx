'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LocaleFormTabs, collectLocaleTranslations, type LocaleFormField } from '../../../_components/LocaleFormTabs';
import { TRANSLATION_LOCALES, localeDefaults, localeKey, type TranslationLocale } from '../../../_components/locale-form';
import { ArrowLeft, Loader2, Upload, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';

const LOCALE_FIELDS: readonly LocaleFormField[] = [
  { name: 'title', label: 'العنوان' },
  { name: 'description', label: 'الوصف', multiline: true },
  { name: 'buttonText', label: 'نص الزر' },
];
const LOCALE_FIELD_NAMES = ['title', 'description', 'buttonText'] as const;
type LocaleShape = { [K in `${(typeof LOCALE_FIELD_NAMES)[number]}_${TranslationLocale}`]: z.ZodOptional<z.ZodString> };
const LOCALE_SHAPE = Object.fromEntries(
  TRANSLATION_LOCALES.flatMap((locale) => LOCALE_FIELD_NAMES.map((f) => [localeKey(f, locale), z.string().optional()]))
) as LocaleShape;

const schema = z.object({
  title: z.string().min(1, 'مطلوب'),
  description: z.string().optional(),
  image: z.string().optional(),
  showButton: z.boolean(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  isActive: z.boolean(),
  ...LOCALE_SHAPE,
});
type FormValues = z.infer<typeof schema>;

export default function EditSlidePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '', description: '', image: '', showButton: true, buttonText: '', buttonLink: '#quick_donate', isActive: true,
      ...localeDefaults(LOCALE_FIELD_NAMES),
    },
  });

  useEffect(() => {
    axios.get(`/api/slides/${params.id}?allTranslations=true`)
      .then((res) => {
        const d = res.data;
        const getTr = (locale: string) => d.translations?.find((t: { locale: string }) => t.locale === locale);
        form.reset({
          title: d.title ?? '',
          description: d.description ?? '',
          image: d.image ?? '',
          showButton: d.showButton ?? true,
          buttonText: d.buttonText ?? '',
          buttonLink: d.buttonLink ?? '#quick_donate',
          isActive: d.isActive !== false,
          ...Object.fromEntries(
            TRANSLATION_LOCALES.flatMap((l) => {
              const t = getTr(l);
              return LOCALE_FIELD_NAMES.map((f) => [localeKey(f, l), t?.[f] ?? '']);
            })
          ),
        });
      })
      .catch(() => { toast.error('فشل التحميل'); router.push('/dashboard/slides'); })
      .finally(() => setLoading(false));
  }, [params.id, router, form]);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      await axios.put(`/api/slides/${params.id}`, {
        title: values.title,
        description: values.description,
        image: values.image,
        showButton: values.showButton,
        buttonText: values.buttonText,
        buttonLink: values.buttonLink,
        isActive: values.isActive,
        translations: collectLocaleTranslations(values, LOCALE_FIELDS),
      });
      toast.success('تم التحديث');
      router.push('/dashboard/slides');
    } catch (e) {
      toast.error(errorMessage(e, 'فشل التحديث'));
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }
    setUploadingImage(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post('/api/upload', fd);
      form.setValue('image', res.data.url);
      toast.success('تم رفع الصورة');
    } catch (err) {
      toast.error(errorMessage(err, 'فشل الرفع'));
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">تعديل الشريحة</h1>
        <Button variant="outline" onClick={() => router.push('/dashboard/slides')} className="gap-2"><ArrowLeft className="w-4 h-4" /> العودة</Button>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <LocaleFormTabs
            form={form}
            fields={LOCALE_FIELDS}
            itemLabel="homepage hero slide"
            arabic={
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>العنوان</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>الوصف</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText" render={({ field }) => (<FormItem><FormLabel>نص الزر</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            }
          />

          <Card className="p-6 space-y-4">
            <FormField control={form.control} name="image" render={({ field }) => (
              <FormItem>
                <FormLabel>الصورة</FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    {field.value ? (
                      <div className="relative w-40 h-28"><img src={field.value} alt="" className="w-full h-full object-cover rounded" />
                        <button type="button" onClick={() => form.setValue('image', '')} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded"><X className="w-4 h-4" /></button></div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-40 h-28 border-2 border-dashed rounded cursor-pointer">
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                        {uploadingImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Upload className="w-6 h-6" /><span className="text-sm">رفع صورة</span></>}
                      </label>
                    )}
                  </div>
                </FormControl></FormItem>
            )} />
            <FormField control={form.control} name="showButton" render={({ field }) => (<FormItem className="flex items-center justify-between"><FormLabel>إظهار الزر</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="buttonLink" render={({ field }) => (<FormItem><FormLabel>رابط الزر</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
            <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex items-center justify-between"><FormLabel>نشط</FormLabel><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)} />
          </Card>
          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={() => router.push('/dashboard/slides')}>إلغاء</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />} حفظ</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
