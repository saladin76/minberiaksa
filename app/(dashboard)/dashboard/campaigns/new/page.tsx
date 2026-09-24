'use client';
import ReactCountryFlag from 'react-country-flag';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WysiwygEditor from '@/app/[locale]/blog/_components/wysiwyg/wysiwyg-editor';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  ArrowLeft,
  X,
  Upload,
  Languages,
  AlertCircle,
  CheckCircle2,
  Globe,
  Star,
  GripVertical
} from 'lucide-react';
import { useLocale } from 'next-intl';
import {
  TRANSLATION_LOCALES,
  LocaleTabTrigger,
  isTranslationLocale,
  localeDefaults,
  localeKey,
  localeNativeLabel,
  type FormLocale,
  type TranslationLocale,
} from '../../_components/locale-form';
import { CampaignLocaleTabContents, CampaignLocaleTabTriggers, CampaignTranslateBar } from '../_components/CampaignLocaleTabs';
import type { TranslatedLocales } from '../../_components/AutoTranslateButton';
import { isEditorContentEmpty } from '@/lib/tiptap-empty-doc';
import {
  SuggestedDonationsSection,
  type SuggestedDonationsSectionRef,
} from '../_components/SuggestedDonationsSection';
import {
  SuggestedShareCountsSection,
  type SuggestedShareCountsSectionRef,
} from '../_components/SuggestedShareCountsSection';
import {
  ShareLabelsSection,
  type ShareLabelsSectionRef,
} from '../_components/ShareLabelsSection';

// ✅ Enhanced schema with translations
/** Fields every translation locale carries on the form, as `field_locale`. */
const LOCALE_FIELDS = ['title', 'image', 'videoUrl'] as const;
type LocaleField = (typeof LOCALE_FIELDS)[number];
/** A mapped type rather than an index signature: zod keeps named keys in its inferred output and drops index signatures. */
type LocaleShape = { [K in `${LocaleField}_${TranslationLocale}`]: z.ZodOptional<z.ZodString> };
const LOCALE_SHAPE = Object.fromEntries(
  TRANSLATION_LOCALES.flatMap((locale) => LOCALE_FIELDS.map((field) => [localeKey(field, locale), z.string().optional()]))
) as LocaleShape;

const formSchema = z
  .object({
  title: z.string()
    .min(1, 'العنوان مطلوب')
    .max(100, 'العنوان طويل جداً'),
  targetAmount: z.number().min(0).max(1000000),
  goalType: z.enum(['FIXED', 'OPEN']),
  fundraisingMode: z.enum(['AMOUNT', 'SHARES']),
  sharePriceUSD: z.number().min(0).max(1000000).optional(),
  // Many-to-many: at least one category required. A campaign can belong to
  // any number of categories — each one will list the campaign on its page.
  categoryIds: z.array(z.string().min(1)).min(1, 'حمله واحدة على الأقل مطلوبة'),
  isActive: z.boolean(),
  images: z.array(z.string())
    .min(1, 'صورة واحدة على الأقل مطلوبة')
    .max(5, 'الحد الأقصى 5 صور'),
  videoUrl: z.string().optional(),
  currentAmount: z.number().min(0).max(1000000).optional(),

  /* One title / cover / video override per translation locale — generated
     from the locale list rather than spelled out, so a new language is a
     new tab without a schema edit. English is required; see superRefine. */
  ...LOCALE_SHAPE,
})
  .superRefine((data, ctx) => {
    if (!data.title_en || !String(data.title_en).trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'English title is required', path: ['title_en'] });
    }
    if (data.goalType === 'FIXED' && (!data.targetAmount || data.targetAmount < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'المبلغ المستهدف مطلوب (≥ 1) عند اختيار هدف ثابت',
        path: ['targetAmount'],
      });
    }
    if (data.fundraisingMode === 'SHARES' && (!data.sharePriceUSD || data.sharePriceUSD <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'أدخل سعر السهم الواحد بالدولار الأمريكي لمشاريع السهوم',
        path: ['sharePriceUSD'],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface Category {
  id: string;
  name: string;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const locale = useLocale();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<FormLocale>('ar');
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);
  const [currentAmountUnlocked, setCurrentAmountUnlocked] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockConfirmText, setUnlockConfirmText] = useState('');
  const CURRENT_AMOUNT_UNLOCK_PHRASE = 'أؤكد تعديل المبلغ';
  const suggestedDonationsRef = useRef<SuggestedDonationsSectionRef>(null);
  const suggestedShareCountsRef = useRef<SuggestedShareCountsSectionRef>(null);
  const shareLabelsRef = useRef<ShareLabelsSectionRef>(null);

  const [descriptionAr, setDescriptionAr] = useState<string | null>(null);
  /* Tiptap JSON per translation locale; Arabic stays in its own state above. */
  const [descriptions, setDescriptions] = useState<Record<string, string | null>>({});
  const setDescription = (locale: TranslationLocale, json: string | null) =>
    setDescriptions((prev) => ({ ...prev, [locale]: json }));
  /* Bumped after a bulk machine translation so the uncontrolled editors remount. */
  const [editorVersion, setEditorVersion] = useState(0);

  const editorClassName = "w-full border border-stone-200 rounded-md bg-white [&_.ProseMirror]:min-h-[150px] [&_.ProseMirror]:p-4 [&_.ProseMirror]:focus:outline-none";

  const parseEditorContent = (json: string | null) => {
    if (!json) return { type: "doc", content: [{ type: "paragraph" }] };
    const trimmed = json.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'doc') return parsed;
      } catch {}
    }
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: json }] }] };
  };

  const isDescEmpty = isEditorContentEmpty;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      targetAmount: 0,
      goalType: 'FIXED',
      fundraisingMode: 'AMOUNT',
      sharePriceUSD: 0,
      categoryIds: [],
      isActive: true,
      images: [],
      videoUrl: '',
      currentAmount: 0,
      ...localeDefaults(LOCALE_FIELDS),
    },
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await axios.get('/api/categories', {
          params: {
            locale: "ar",
            counts: true,
            limit: 200,
          },
          headers: {
            'x-locale': locale,
          },
        });
        setCategories(response.data.items);
      } catch (error) {
        console.error('Error fetching categories:', error);
        toast.error('فشل في تحميل الحملات');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [locale]);

  const onSubmit = async (values: FormValues) => {
    if (isDescEmpty(descriptionAr)) {
      toast.error('الوصف العربي مطلوب');
      setActiveTab('ar');
      return;
    }
    if (isDescEmpty(descriptions.en ?? null)) {
      toast.error('English description is required');
      setActiveTab('en');
      return;
    }
    setSaving(true);
    try {
      // ✅ Prepare request with translations
      const requestData = {
        title: values.title,
        description: descriptionAr || '',
        goalType: values.goalType,
        fundraisingMode: values.fundraisingMode,
        targetAmount: values.goalType === 'OPEN' ? 0 : values.targetAmount,
        sharePriceUSD:
          values.fundraisingMode === 'SHARES' ? values.sharePriceUSD : undefined,
        categoryIds: values.categoryIds,
        isActive: values.isActive,
        images: values.images,
        videoUrl: values.videoUrl,
        ...(currentAmountUnlocked && Number(values.currentAmount ?? 0) > 0
          ? { currentAmount: Math.max(0, Number(values.currentAmount)) }
          : {}),

        // English is always sent (required); every other locale only when it
        // has both a title and a description. Per-locale image/videoUrl are
        // optional overrides — sent through whenever provided.
        translations: Object.fromEntries(
          TRANSLATION_LOCALES.flatMap((locale) => {
            const title = String(values[localeKey('title', locale)] ?? '').trim();
            const description = descriptions[locale] ?? null;
            if (locale !== 'en' && (!title || isDescEmpty(description))) return [];
            return [[
              locale,
              {
                title,
                description,
                image: values[localeKey('image', locale)] || null,
                videoUrl: values[localeKey('videoUrl', locale)] || null,
              },
            ]];
          })
        ),
        suggestedDonations:
          values.fundraisingMode === 'AMOUNT'
            ? suggestedDonationsRef.current?.getPayload()
            : undefined,
        suggestedShareCounts:
          values.fundraisingMode === 'SHARES'
            ? suggestedShareCountsRef.current?.getPayload()
            : undefined,
        shareLabels:
          values.fundraisingMode === 'SHARES'
            ? shareLabelsRef.current?.getPayload() ?? null
            : undefined,
      };

      await axios.post('/api/campaigns', requestData);
      toast.success('تم إنشاء المشروع بنجاح');
      router.push('/dashboard/campaigns');
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error(errorMessage(error, 'فشل في إنشاء المشروع'));
    } finally {
      setSaving(false);
    }
  };

  // Per-locale single-image upload (optional override — fallback is the main Arabic cover).
  const [uploadingLocale, setUploadingLocale] = useState<null | TranslationLocale>(null);

  type LocaleImageKey = `image_${TranslationLocale}`;
  type LocaleVideoKey = `videoUrl_${TranslationLocale}`;

  const handleLocaleImageUpload = async (
    locale: TranslationLocale,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const rejection = validateImageFile(file);
    if (rejection) {
      toast.error(rejection);
      return;
    }
    setUploadingLocale(locale);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('/api/upload', formData);
      form.setValue(`image_${locale}` as LocaleImageKey, response.data?.url ?? '', {
        shouldDirty: true,
      });
      toast.success('تم رفع الصورة');
    } catch (err) {
      console.error('Locale image upload error:', err);
      toast.error(errorMessage(err, 'فشل رفع الصورة'));
    } finally {
      setUploadingLocale(null);
    }
  };

  const removeLocaleImage = (locale: TranslationLocale) => {
    const key = `image_${locale}` as LocaleImageKey;
    const current = form.getValues(key);
    if (current) {
      const publicId = current.split('/').slice(-1)[0]?.split('.')[0];
      if (publicId) axios.delete(`/api/upload?publicId=${publicId}`).catch(() => {});
    }
    form.setValue(key, '', { shouldDirty: true });
  };

  const renderLocaleMedia = (locale: TranslationLocale) => {
    const name = localeNativeLabel(locale);
    const labels = {
      image: `صورة الغلاف (${name}) — اختيارية`,
      imageHint: `رفع غلاف ${name}`,
      video: `رابط الفيديو (${name}) — اختياري`,
      videoHint: `رابط فيديو خاص بهذه اللغة.`,
      optionalNote: 'الصورة ورابط الفيديو هنا اختياريان — يحلّان محل الغلاف/الفيديو العربي فقط عند تعبئتهما. الصورة الرئيسية العربية (≥ 1) هي المطلوبة وحدها.',
    };
    const direction = 'rtl' as const;
    const imageKey = `image_${locale}` as LocaleImageKey;
    const videoKey = `videoUrl_${locale}` as LocaleVideoKey;
    const isUploading = uploadingLocale === locale;
    return (
      <div className="space-y-4 mt-2" dir={direction}>
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{labels.optionalNote}</span>
        </div>

        <FormField
          control={form.control}
          name={imageKey}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.image}</FormLabel>
              <FormControl>
                <div>
                  {field.value ? (
                    <div className="relative group w-56">
                      <img
                        src={field.value}
                        alt="locale cover"
                        className="w-56 h-40 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeLocaleImage(locale)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLocaleImageUpload(locale, e)}
                        className="hidden"
                        id={`new-locale-image-${locale}`}
                        disabled={isUploading}
                      />
                      <label
                        htmlFor={`new-locale-image-${locale}`}
                        className={`flex flex-col items-center justify-center w-56 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors ${
                          isUploading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isUploading ? (
                          <Loader2 className="w-6 h-6 animate-spin text-brand" />
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-gray-400" />
                            <span className="mt-2 text-xs text-gray-500">{labels.imageHint}</span>
                          </>
                        )}
                      </label>
                    </>
                  )}
                </div>
              </FormControl>
              <FormDescription className="text-xs">
                {labels.imageHint} — 1200×675 (16:9), JPG/PNG, ≤ 2MB.
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={videoKey}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.video}</FormLabel>
              <FormControl>
                <Input {...field} dir="ltr" placeholder="https://www.youtube.com/watch?v=..." />
              </FormControl>
              <FormDescription className="text-xs">{labels.videoHint}</FormDescription>
            </FormItem>
          )}
        />
      </div>
    );
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentImages = form.getValues('images');
    if (currentImages.length + files.length > 5) {
      toast.error('الحد الأقصى 5 صور');
      return;
    }

    setUploadingImage(true);
    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await axios.post('/api/upload', formData);
        return response.data.url;
      } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
      }
    });

    try {
      const uploadedUrls = await Promise.all(uploadPromises);
      form.setValue('images', [...currentImages, ...uploadedUrls]);
      toast.success('تم رفع الصور بنجاح');
    } catch (error) {
      toast.error('فشل في رفع الصور');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async (index: number) => {
    try {
      const currentImages = form.getValues('images');
      const imageUrl = currentImages[index];

      const publicId = imageUrl.split('/').slice(-1)[0].split('.')[0];
      if (publicId) {
        await axios.delete(`/api/upload?publicId=${publicId}`);
      }

      const newImages = currentImages.filter((_, i) => i !== index);
      form.setValue('images', newImages);
      toast.success('تم حذف الصورة بنجاح');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('فشل في حذف الصورة');
    }
  };

  const reorderImages = (from: number, to: number) => {
    if (from === to) return;
    const list = [...form.getValues('images')];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    form.setValue('images', list, { shouldValidate: true, shouldDirty: true });
    if (to === 0 && from !== 0) {
      toast.success('تم تعيين الصورة الرئيسية');
    }
  };

  // ✅ Check translation completeness
const getTranslationStatus = () => {
    const done: Record<string, boolean> = {};
    for (const locale of TRANSLATION_LOCALES) {
      done[locale] = !!form.watch(localeKey('title', locale)) && !isDescEmpty(descriptions[locale] ?? null);
    }
    const completed = Object.values(done).filter(Boolean).length;
    return { completed, total: TRANSLATION_LOCALES.length, done, hasEn: !!done.en };
  };

  /* Machine translations land in the form (titles) and the description map;
     only empty targets are filled unless the editor asked to replace. */
  const applyTranslations = (translations: TranslatedLocales, overwrite: boolean) => {
    let touchedEditors = false;
    for (const [code, t] of Object.entries(translations)) {
      if (!isTranslationLocale(code)) continue;
      const locale: TranslationLocale = code;
      const key = localeKey('title', locale);
      if (t.fields.title && (overwrite || !String(form.getValues(key) ?? '').trim())) {
        form.setValue(key, t.fields.title, { shouldDirty: true });
      }
      if (t.richFields.description && (overwrite || isDescEmpty(descriptions[locale] ?? null))) {
        setDescriptions((prev) => ({ ...prev, [locale]: t.richFields.description }));
        touchedEditors = true;
      }
    }
    if (touchedEditors) setEditorVersion((v) => v + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  const translationStatus = getTranslationStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">إنشاء مشروع جديدة</h1>
          <p className="text-gray-600">قم بإدخال معلومات المشروع</p>
          
          {/* ✅ Translation Status Badge */}
          <div className="flex items-center gap-2 mt-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">
              الترجمات: {translationStatus.completed}/{translationStatus.total}
            </span>
            {TRANSLATION_LOCALES.filter((l) => translationStatus.done[l]).map((l) => (
              <span key={l} title={`${localeNativeLabel(l)} ready`}><CheckCircle2 className="w-4 h-4 text-green-600" /></span>
            ))}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/campaigns')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          العودة
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* ✅ Multi-Language Tabs for Campaign Content */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Languages className="w-5 h-5 text-gray-700" />
              <h2 className="text-lg font-semibold">المعلومات الأساسية</h2>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <CampaignLocaleTabTriggers
                done={translationStatus.done}
                leadingTrigger={<LocaleTabTrigger locale="ar" required />}
              />

              {/* Arabic Tab */}
              <TabsContent value="ar" className="space-y-6">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  

                  <FormField
                    control={form.control}
                    name="categoryIds"
                    render={({ field }) => {
                      const selected = field.value ?? [];
                      const selectedCategories = categories.filter((c) =>
                        selected.includes(c.id)
                      );
                      const toggle = (id: string) => {
                        const next = selected.includes(id)
                          ? selected.filter((x) => x !== id)
                          : [...selected, id];
                        field.onChange(next);
                      };
                      return (
                        <FormItem dir="rtl">
                          <FormLabel>الحملات *</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  className="w-full justify-between font-normal"
                                >
                                  {selectedCategories.length > 0
                                    ? `${selectedCategories.length} حملة مختارة`
                                    : 'اختر حملة أو أكثر'}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-full p-0"
                              align="start"
                              style={{ width: 'var(--radix-popover-trigger-width)' }}
                            >
                              <Command>
                                <CommandInput placeholder="ابحث عن حملة..." />
                                <CommandList>
                                  <CommandEmpty>لا توجد نتائج</CommandEmpty>
                                  <CommandGroup>
                                    {categories.map((category) => {
                                      const isSel = selected.includes(category.id);
                                      return (
                                        <CommandItem
                                          key={category.id}
                                          value={category.name}
                                          onSelect={() => toggle(category.id)}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              isSel ? 'opacity-100' : 'opacity-0'
                                            }`}
                                          />
                                          {category.name}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {selectedCategories.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {selectedCategories.map((c) => (
                                <Badge
                                  key={c.id}
                                  variant="secondary"
                                  className="gap-1.5 pr-1"
                                >
                                  <span>{c.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggle(c.id)}
                                    className="rounded-full hover:bg-black/10 p-0.5"
                                    aria-label={`إزالة ${c.name}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          <FormDescription className="text-xs">
                            يمكن للمشروع أن ينتمي لأكثر من حملة — سيظهر في صفحة كل
                            حملة مختارة.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem dir='rtl'>
                        <FormLabel>عنوان المشروع *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="أدخل عنوان المشروع" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>

                <FormItem dir='rtl'>
                  <FormLabel>وصف المشروع *</FormLabel>
                  <WysiwygEditor
                    defaultValue={parseEditorContent(descriptionAr)}
                    onUpdate={(editor) => setDescriptionAr(JSON.stringify(editor?.getJSON()))}
                    className={editorClassName}
                  />
                  <FormDescription>
                    قدم وصفاً شاملاً للمشروع وأهدافها
                  </FormDescription>
                </FormItem>
                <CampaignTranslateBar
                  arabic={{ title: form.watch('title') ?? '', description: descriptionAr }}
                  onTranslated={applyTranslations}
                />
              </TabsContent>

              <CampaignLocaleTabContents
                form={form}
                descriptions={descriptions}
                onDescription={setDescription}
                editorVersion={editorVersion}
                parseEditorContent={parseEditorContent}
                editorClassName={editorClassName}
                renderMedia={renderLocaleMedia}
                arabic={{ title: form.watch('title') ?? '', description: descriptionAr }}
                onTranslated={applyTranslations}
              />
            </Tabs>
          </Card>

          {/* Campaign Settings */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">إعدادات المشروع</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="goalType"
                render={({ field }) => (
                  <FormItem dir="rtl">
                    <FormLabel>نوع الهدف</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر نوع الهدف" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="FIXED">هدف محدد (شريط تقدم)</SelectItem>
                        <SelectItem value="OPEN">هدف مفتوح (بدون هدف نهائي)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      الهدف المفتوح يخفي المبلغ المستهدف وشريط النسبة؛ يبقى إجمالي ما جُمع ظاهرًا.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fundraisingMode"
                render={({ field }) => (
                  <FormItem dir="rtl">
                    <FormLabel>طريقة التبرع</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="طريقة التبرع" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AMOUNT">مبلغ حر</SelectItem>
                        <SelectItem value="SHARES">سهوم (سعر السهم × العدد)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      في وضع السهوم يحدد المتبرع عدد الأسهم؛ المبلغ = العدد × سعر السهم (بالدولار).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch('goalType') === 'FIXED' && (
              <FormField
                control={form.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem dir='rtl'>
                    <FormLabel>المبلغ المستهدف *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="أدخل المبلغ المستهدف"
                      />
                    </FormControl>
                    <FormDescription>
                      المبلغ الإجمالي المطلوب للمشروع بالدولار
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}

              <FormField
                control={form.control}
                name="currentAmount"
                render={({ field }) => (
                  <FormItem dir="rtl">
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>المبلغ الحالي عند الإنشاء (متقدم)</FormLabel>
                      {!currentAmountUnlocked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs border-amber-500 text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            setUnlockConfirmText('');
                            setUnlockDialogOpen(true);
                          }}
                        >
                          <AlertCircle className="w-3.5 h-3.5 ml-1" />
                          فتح للتعديل
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-3 text-xs text-gray-500 hover:text-gray-700"
                          onClick={() => {
                            form.setValue('currentAmount', 0);
                            setCurrentAmountUnlocked(false);
                          }}
                        >
                          إلغاء التعديل
                        </Button>
                      )}
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        disabled={!currentAmountUnlocked}
                        className={
                          currentAmountUnlocked
                            ? 'border-red-500 ring-1 ring-red-200 focus-visible:ring-red-300'
                            : ''
                        }
                      />
                    </FormControl>
                    {currentAmountUnlocked ? (
                      <Alert
                        variant="destructive"
                        className="mt-2 border-red-300 bg-red-50 text-red-800"
                      >
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs leading-relaxed">
                          تعيين <strong>المبلغ الحالي</strong> يدوياً عند الإنشاء مخصّص لحالات استثنائية
                          (مثل ترحيل مشروع قائم بمبلغ متراكم سابق). القيمة ستظهر للمتبرعين فوراً
                          ولن يكون لها سجل تبرعات مقابل، فاحرص أن يكون التعيين مقصوداً.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <FormDescription>
                        افتراضياً يبدأ المشروع بمبلغ <strong>0</strong> ويُحدَّث تلقائياً مع التبرعات.
                        تجاوز هذا يدوياً يتطلب تأكيداً صريحاً.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Dialog
                open={unlockDialogOpen}
                onOpenChange={(open) => {
                  setUnlockDialogOpen(open);
                  if (!open) setUnlockConfirmText('');
                }}
              >
                <DialogContent className="font-sans" dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      تأكيد تعيين مبلغ ابتدائي
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm leading-relaxed text-gray-700">
                    <p>
                      أنت على وشك تعيين <strong>المبلغ الحالي</strong> للمشروع يدوياً عند الإنشاء.
                      الافتراضي أن يبدأ المشروع بـ 0 ويُحسب من سجل التبرعات.
                    </p>
                    <ul className="list-disc pr-5 space-y-1 text-xs text-gray-600">
                      <li>القيمة الجديدة ستظهر للمتبرعين فوراً على صفحة المشروع.</li>
                      <li>لن يقابلها سجل تبرعات في قاعدة البيانات.</li>
                      <li>يُسجَّل هذا الإجراء في سجل التدقيق (audit log).</li>
                    </ul>
                    <div className="space-y-1.5 pt-2">
                      <label className="text-sm font-medium text-gray-800">
                        اكتب الجملة التالية للمتابعة:{' '}
                        <span className="font-mono text-red-700">
                          {CURRENT_AMOUNT_UNLOCK_PHRASE}
                        </span>
                      </label>
                      <Input
                        autoFocus
                        value={unlockConfirmText}
                        onChange={(e) => setUnlockConfirmText(e.target.value)}
                        placeholder={CURRENT_AMOUNT_UNLOCK_PHRASE}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setUnlockDialogOpen(false);
                        setUnlockConfirmText('');
                      }}
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        unlockConfirmText.trim() !== CURRENT_AMOUNT_UNLOCK_PHRASE
                      }
                      className="!bg-red-600 hover:!bg-red-700 !text-white disabled:!bg-red-300"
                      onClick={() => {
                        setCurrentAmountUnlocked(true);
                        setUnlockDialogOpen(false);
                        setUnlockConfirmText('');
                      }}
                    >
                      تأكيد وفتح الحقل
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {form.watch('fundraisingMode') === 'SHARES' && (
                <FormField
                  control={form.control}
                  name="sharePriceUSD"
                  render={({ field }) => (
                    <FormItem dir="rtl">
                      <FormLabel>سعر السهم الواحد (USD) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          placeholder="مثال: 100"
                        />
                      </FormControl>
                      <FormDescription>
                        سعر كل سهم بالدولار؛ يُحوَّل تلقائيًا لعملة العرض للمتبرع.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="videoUrl"
                render={({ field }) => (
                  <FormItem dir='rtl'>
                    <FormLabel>رابط الفيديو (اختياري)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="أدخل رابط الفيديو (YouTube أو Facebook)"
                      />
                    </FormControl>
                    <FormDescription>
                      رابط فيديو توضيحي للمشروع
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {form.watch('fundraisingMode') === 'SHARES' && (
              <div className="mt-6 space-y-4">
                <SuggestedShareCountsSection ref={suggestedShareCountsRef} />
                <ShareLabelsSection ref={shareLabelsRef} />
              </div>
            )}
            {form.watch('fundraisingMode') === 'AMOUNT' && (
              <div className="mt-6">
                <SuggestedDonationsSection ref={suggestedDonationsRef} />
              </div>
            )}
          </Card>

          {/* Images */}
          <Card className="p-6">
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem dir='rtl'>
                  <FormLabel>صور المشروع *</FormLabel>
                  <FormControl>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {field.value.map((url, index) => {
                          const isMain = index === 0;
                          const isDragging = draggedImageIndex === index;
                          const isDropTarget = dragOverImageIndex === index && draggedImageIndex !== index;
                          return (
                            <div
                              key={url}
                              draggable
                              onDragStart={(e) => {
                                setDraggedImageIndex(index);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                if (dragOverImageIndex !== index) setDragOverImageIndex(index);
                              }}
                              onDragLeave={() => {
                                if (dragOverImageIndex === index) setDragOverImageIndex(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (draggedImageIndex !== null && draggedImageIndex !== index) {
                                  reorderImages(draggedImageIndex, index);
                                }
                                setDraggedImageIndex(null);
                                setDragOverImageIndex(null);
                              }}
                              onDragEnd={() => {
                                setDraggedImageIndex(null);
                                setDragOverImageIndex(null);
                              }}
                              className={`relative group rounded-lg cursor-move transition-all ${
                                isMain
                                  ? 'ring-4 ring-brand ring-offset-2 shadow-lg'
                                  : 'ring-1 ring-gray-200 hover:ring-brand/40'
                              } ${isDragging ? 'opacity-40 scale-95' : ''} ${
                                isDropTarget ? 'ring-4 ring-brand-orange ring-offset-2' : ''
                              }`}
                            >
                              <img
                                src={url}
                                alt={`صورة ${index + 1}`}
                                draggable={false}
                                className="w-full h-32 object-cover rounded-lg pointer-events-none select-none"
                              />
                              {isMain && (
                                <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-brand to-brand/0 rounded-t-lg p-2 flex items-center gap-1.5">
                                  <Star className="w-4 h-4 text-white fill-white" />
                                  <span className="text-white text-xs font-bold drop-shadow">الصورة الرئيسية</span>
                                </div>
                              )}
                              <div className="absolute top-2 left-2 p-1 bg-black/50 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              {!isMain && (
                                <button
                                  type="button"
                                  onClick={() => reorderImages(index, 0)}
                                  title="تعيين كصورة رئيسية"
                                  className="absolute bottom-2 left-2 px-2 py-1 bg-white text-brand text-xs font-semibold rounded shadow opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:bg-brand hover:text-white"
                                >
                                  <Star className="w-3 h-3" />
                                  جعلها الرئيسية
                                </button>
                              )}
                              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded font-mono">
                                {index + 1}
                              </div>
                            </div>
                          );
                        })}
                        {field.value.length < 5 && (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleImageUpload}
                              className="hidden"
                              id="images"
                              disabled={uploadingImage}
                            />
                            <label
                              htmlFor="images"
                              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-brand transition-colors"
                            >
                              {uploadingImage ? (
                                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="mt-2 text-sm text-gray-500">
                                    اضغط لإضافة صور
                                  </span>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                      <FormDescription>
                        يمكنك رفع حتى 5 صور للمشروع. <strong>الصورة الأولى</strong> ستكون الصورة الرئيسية المعروضة.
                        <br />
                        اسحب الصور لإعادة ترتيبها، أو اضغط زر <strong>«جعلها الرئيسية»</strong> لتغيير الصورة الرئيسية.
                        <br />
                        <span className="text-amber-700">
                          الحجم المُوصى به: <strong>1200×900 px</strong> (نسبة 4:3)، صيغة JPG أو PNG، حجم الملف لا يزيد عن 2MB.
                        </span>
                      </FormDescription>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>

          {/* Status */}
          <Card className="p-6">
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>حالة المشروع</FormLabel>
                    <FormDescription>
                      تحديد ما إذا كانت المشروع نشطة ومرئية للمستخدمين فور الإنشاء
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </Card>

          {/* ✅ Translation Summary */}
          {translationStatus.completed > 0 && (
            <Card className="p-6 bg-brand/8 border-blue-200">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-brand mt-0.5" />
                <div>
                  <h3 className="font-semibold text-brand mb-2">ملخص الترجمات</h3>
                  <div className="grid gap-1 text-sm text-brand sm:grid-cols-2">
                    <p>✓ المحتوى العربي: مكتمل (مطلوب)</p>
                    {TRANSLATION_LOCALES.map((l) => (
                      <p key={l}>
                        {translationStatus.done[l] ? '✓' : '○'} {localeNativeLabel(l)}: {translationStatus.done[l] ? 'مكتملة' : l === 'en' ? 'غير مكتملة (مطلوبة)' : 'غير مكتملة (اختياري)'}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* SEO الذكي card mounts here via DashboardAutoEnhancements portal. */}
          <div id="dashboard-project-seo-anchor" />

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/campaigns')}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              className="bg-brand hover:bg-brand-dark gap-2"
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              إنشاء المشروع
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}