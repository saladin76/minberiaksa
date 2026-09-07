'use client';

import ReactCountryFlag from 'react-country-flag';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CategoryIconPicker } from '../../_components/CategoryIconPicker';
import { SmartSeoWorkbenchCard } from '../../../_components/SmartSeoWorkbenchCard';
import { SaveStatusNotice, type SaveStatusState } from '../../../_components/SaveStatusNotice';

const formSchema = z.object({
  name: z.string().min(1, 'اسم الحملة مطلوب').max(50, 'اسم الحملة طويل جداً'),
  description: z.string().max(500, 'الوصف طويل جداً').optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().optional(),
  name_en: z.string().max(50, 'English name is too long').optional(),
  description_en: z.string().max(500).optional(),
  name_fr: z.string().max(50).optional(),
  description_fr: z.string().max(500).optional(),
  name_tr: z.string().max(50).optional(),
  description_tr: z.string().max(500).optional(),
  name_id: z.string().max(50).optional(),
  description_id: z.string().max(500).optional(),
  name_pt: z.string().max(50).optional(),
  description_pt: z.string().max(500).optional(),
  name_es: z.string().max(50).optional(),
  description_es: z.string().max(500).optional(),
  name_de: z.string().max(50).optional(),
  description_de: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;
type SeoLocale = 'ar' | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de';

export default function EditCategoryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeLocale, setActiveLocale] = useState<SeoLocale>('ar');
  const [saveStatus, setSaveStatus] = useState<SaveStatusState | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', description: '', image: '', icon: '', order: 0,
      name_en: '', description_en: '', name_fr: '', description_fr: '',
      name_tr: '', description_tr: '', name_id: '', description_id: '',
      name_pt: '', description_pt: '', name_es: '', description_es: '',
      name_de: '', description_de: '',
    },
  });

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const response = await axios.get(`/api/categories/${params.id}?allTranslations=true`);
        const category = response.data;
        const getTr = (locale: string) => category.translations?.find((t: { locale: string }) => t.locale === locale);
        const en = getTr('en'); const fr = getTr('fr'); const tr = getTr('tr'); const id = getTr('id'); const pt = getTr('pt'); const es = getTr('es'); const de = getTr('de');
        form.reset({
          name: category.name || '',
          description: category.description || '',
          image: category.image || '',
          icon: category.icon || '',
          order: category.order ?? 0,
          name_en: en?.name || '', description_en: en?.description || '',
          name_fr: fr?.name || '', description_fr: fr?.description || '',
          name_tr: tr?.name || '', description_tr: tr?.description || '',
          name_id: id?.name || '', description_id: id?.description || '',
          name_pt: pt?.name || '', description_pt: pt?.description || '',
          name_es: es?.name || '', description_es: es?.description || '',
          name_de: de?.name || '', description_de: de?.description || '',
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
        translations: {
          en: { name: values.name_en ?? '', description: values.description_en ?? '' },
          fr: { name: values.name_fr ?? '', description: values.description_fr ?? '' },
          tr: { name: values.name_tr ?? '', description: values.description_tr ?? '' },
          id: { name: values.name_id ?? '', description: values.description_id ?? '' },
          pt: { name: values.name_pt ?? '', description: values.description_pt ?? '' },
          es: { name: values.name_es ?? '', description: values.description_es ?? '' },
          de: { name: values.name_de ?? '', description: values.description_de ?? '' },
        },
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
          <Tabs value={activeLocale} onValueChange={(value) => setActiveLocale(value as SeoLocale)} className="w-full">
            <TabsList className="flex flex-wrap gap-1 mb-4" dir="rtl">
              <TabsTrigger value="ar" className="gap-2"><ReactCountryFlag countryCode="SA" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> العربية</TabsTrigger>
              <TabsTrigger value="en" className="gap-2"><ReactCountryFlag countryCode="GB" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> English</TabsTrigger>
              <TabsTrigger value="fr" className="gap-2"><ReactCountryFlag countryCode="FR" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Français</TabsTrigger>
              <TabsTrigger value="tr" className="gap-2"><ReactCountryFlag countryCode="TR" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Türkçe</TabsTrigger>
              <TabsTrigger value="id" className="gap-2"><ReactCountryFlag countryCode="ID" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Bahasa</TabsTrigger>
              <TabsTrigger value="pt" className="gap-2"><ReactCountryFlag countryCode="PT" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Português</TabsTrigger>
              <TabsTrigger value="es" className="gap-2"><ReactCountryFlag countryCode="ES" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Español</TabsTrigger>
              <TabsTrigger value="de" className="gap-2"><ReactCountryFlag countryCode="DE" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Deutsch</TabsTrigger>
            </TabsList>

            <TabsContent value="ar" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>اسم الحملة</FormLabel><FormControl><Input {...field} placeholder="أدخل اسم الحملة" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>وصف الحملة</FormLabel><FormControl><Textarea placeholder="اكتب وصفاً للحملة..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('ar', form.watch('name'), form.watch('description'))}</TabsContent>
            <TabsContent value="en" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_en" render={({ field }) => (<FormItem><FormLabel>Category name (English)</FormLabel><FormControl><Input {...field} placeholder="Category name" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_en" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Description..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('en', form.watch('name_en') || '', form.watch('description_en'))}</TabsContent>
            <TabsContent value="fr" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_fr" render={({ field }) => (<FormItem><FormLabel>Nom (français)</FormLabel><FormControl><Input {...field} placeholder="Nom de la catégorie" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_fr" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Description..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('fr', form.watch('name_fr') || '', form.watch('description_fr'))}</TabsContent>
            <TabsContent value="tr" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_tr" render={({ field }) => (<FormItem><FormLabel>Kategori adı (Türkçe)</FormLabel><FormControl><Input {...field} placeholder="Kategori adı" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_tr" render={({ field }) => (<FormItem><FormLabel>Açıklama</FormLabel><FormControl><Textarea placeholder="Açıklama..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('tr', form.watch('name_tr') || '', form.watch('description_tr'))}</TabsContent>
            <TabsContent value="id" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_id" render={({ field }) => (<FormItem><FormLabel>Nama kategori (Indonesia)</FormLabel><FormControl><Input {...field} placeholder="Nama kategori" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_id" render={({ field }) => (<FormItem><FormLabel>Deskripsi</FormLabel><FormControl><Textarea placeholder="Deskripsi..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('id', form.watch('name_id') || '', form.watch('description_id'))}</TabsContent>
            <TabsContent value="pt" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_pt" render={({ field }) => (<FormItem><FormLabel>Nome da categoria (Português)</FormLabel><FormControl><Input {...field} placeholder="Nome da categoria" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_pt" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea placeholder="Descrição..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('pt', form.watch('name_pt') || '', form.watch('description_pt'))}</TabsContent>
            <TabsContent value="es" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_es" render={({ field }) => (<FormItem><FormLabel>Nombre de categoría (Español)</FormLabel><FormControl><Input {...field} placeholder="Nombre de la categoría" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_es" render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Descripción..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('es', form.watch('name_es') || '', form.watch('description_es'))}</TabsContent>
            <TabsContent value="de" className="mt-0 space-y-6"><LocaleCard><FormField control={form.control} name="name_de" render={({ field }) => (<FormItem><FormLabel>Kategoriename (Deutsch)</FormLabel><FormControl><Input {...field} placeholder="Kategoriename" /></FormControl><FormMessage /></FormItem>)} /><FormField control={form.control} name="description_de" render={({ field }) => (<FormItem><FormLabel>Beschreibung</FormLabel><FormControl><Textarea placeholder="Beschreibung..." className="resize-y" {...field} /></FormControl><FormMessage /></FormItem>)} /></LocaleCard>{renderSeo('de', form.watch('name_de') || '', form.watch('description_de'))}</TabsContent>
          </Tabs>

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
