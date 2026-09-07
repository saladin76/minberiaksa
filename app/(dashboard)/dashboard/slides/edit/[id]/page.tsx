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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Upload, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';

const schema = z.object({
  title: z.string().min(1, 'مطلوب'),
  description: z.string().optional(),
  image: z.string().optional(),
  showButton: z.boolean(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  isActive: z.boolean(),
  title_en: z.string().optional(),
  description_en: z.string().optional(),
  buttonText_en: z.string().optional(),
  title_fr: z.string().optional(),
  description_fr: z.string().optional(),
  buttonText_fr: z.string().optional(),
  title_tr: z.string().optional(),
  description_tr: z.string().optional(),
  buttonText_tr: z.string().optional(),
  title_id: z.string().optional(),
  description_id: z.string().optional(),
  buttonText_id: z.string().optional(),
  title_pt: z.string().optional(),
  description_pt: z.string().optional(),
  buttonText_pt: z.string().optional(),
  title_es: z.string().optional(),
  description_es: z.string().optional(),
  buttonText_es: z.string().optional(),
  title_de: z.string().optional(),
  description_de: z.string().optional(),
  buttonText_de: z.string().optional(),
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
      title_en: '', description_en: '', buttonText_en: '', title_fr: '', description_fr: '', buttonText_fr: '',
      title_tr: '', description_tr: '', buttonText_tr: '', title_id: '', description_id: '', buttonText_id: '',
      title_pt: '', description_pt: '', buttonText_pt: '', title_es: '', description_es: '', buttonText_es: '',
      title_de: '', description_de: '', buttonText_de: '',
    },
  });

  useEffect(() => {
    axios.get(`/api/slides/${params.id}?allTranslations=true`)
      .then((res) => {
        const d = res.data;
        const getTr = (locale: string) => d.translations?.find((t: { locale: string }) => t.locale === locale);
        const en = getTr('en'); const fr = getTr('fr'); const tr = getTr('tr'); const id = getTr('id'); const pt = getTr('pt'); const es = getTr('es'); const de = getTr('de');
        form.reset({
          title: d.title ?? '',
          description: d.description ?? '',
          image: d.image ?? '',
          showButton: d.showButton ?? true,
          buttonText: d.buttonText ?? '',
          buttonLink: d.buttonLink ?? '#quick_donate',
          isActive: d.isActive !== false,
          title_en: en?.title ?? '', description_en: en?.description ?? '', buttonText_en: en?.buttonText ?? '',
          title_fr: fr?.title ?? '', description_fr: fr?.description ?? '', buttonText_fr: fr?.buttonText ?? '',
          title_tr: tr?.title ?? '', description_tr: tr?.description ?? '', buttonText_tr: tr?.buttonText ?? '',
          title_id: id?.title ?? '', description_id: id?.description ?? '', buttonText_id: id?.buttonText ?? '',
          title_pt: pt?.title ?? '', description_pt: pt?.description ?? '', buttonText_pt: pt?.buttonText ?? '',
          title_es: es?.title ?? '', description_es: es?.description ?? '', buttonText_es: es?.buttonText ?? '',
          title_de: de?.title ?? '', description_de: de?.description ?? '', buttonText_de: de?.buttonText ?? '',
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
        translations: {
          en: { title: values.title_en ?? '', description: values.description_en ?? '', buttonText: values.buttonText_en ?? '' },
          fr: { title: values.title_fr ?? '', description: values.description_fr ?? '', buttonText: values.buttonText_fr ?? '' },
          tr: { title: values.title_tr ?? '', description: values.description_tr ?? '', buttonText: values.buttonText_tr ?? '' },
          id: { title: values.title_id ?? '', description: values.description_id ?? '', buttonText: values.buttonText_id ?? '' },
          pt: { title: values.title_pt ?? '', description: values.description_pt ?? '', buttonText: values.buttonText_pt ?? '' },
          es: { title: values.title_es ?? '', description: values.description_es ?? '', buttonText: values.buttonText_es ?? '' },
          de: { title: values.title_de ?? '', description: values.description_de ?? '', buttonText: values.buttonText_de ?? '' },
        },
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
          <Tabs defaultValue="ar" className="w-full">
            <TabsList className="flex flex-wrap gap-1 mb-4" dir="rtl">
              <TabsTrigger value="ar">العربية</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="fr">Français</TabsTrigger>
              <TabsTrigger value="tr">Türkçe</TabsTrigger>
              <TabsTrigger value="id">Bahasa</TabsTrigger>
              <TabsTrigger value="pt">Português</TabsTrigger>
              <TabsTrigger value="es">Español</TabsTrigger>
              <TabsTrigger value="de">Deutsch</TabsTrigger>
            </TabsList>
            <TabsContent value="ar" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>العنوان</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>الوصف</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText" render={({ field }) => (<FormItem><FormLabel>نص الزر</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="en" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_en" render={({ field }) => (<FormItem><FormLabel>Title (English)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_en" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_en" render={({ field }) => (<FormItem><FormLabel>Button text</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="fr" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_fr" render={({ field }) => (<FormItem><FormLabel>Titre (français)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_fr" render={({ field }) => (<FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_fr" render={({ field }) => (<FormItem><FormLabel>Texte du bouton</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="tr" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_tr" render={({ field }) => (<FormItem><FormLabel>Başlık (Türkçe)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_tr" render={({ field }) => (<FormItem><FormLabel>Açıklama</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_tr" render={({ field }) => (<FormItem><FormLabel>Buton metni</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="id" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_id" render={({ field }) => (<FormItem><FormLabel>Judul (Indonesia)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_id" render={({ field }) => (<FormItem><FormLabel>Deskripsi</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_id" render={({ field }) => (<FormItem><FormLabel>Teks tombol</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="pt" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_pt" render={({ field }) => (<FormItem><FormLabel>Título (Português)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_pt" render={({ field }) => (<FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_pt" render={({ field }) => (<FormItem><FormLabel>Texto do botão</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="es" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_es" render={({ field }) => (<FormItem><FormLabel>Título (Español)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_es" render={({ field }) => (<FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_es" render={({ field }) => (<FormItem><FormLabel>Texto del botón</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
            <TabsContent value="de" className="mt-0">
              <Card className="p-6 space-y-4">
                <FormField control={form.control} name="title_de" render={({ field }) => (<FormItem><FormLabel>Titel (Deutsch)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="description_de" render={({ field }) => (<FormItem><FormLabel>Beschreibung</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl></FormItem>)} />
                <FormField control={form.control} name="buttonText_de" render={({ field }) => (<FormItem><FormLabel>Button-Text</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>)} />
              </Card>
            </TabsContent>
          </Tabs>

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
