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
  SuggestedDonationsSection,
  type SuggestedDonationsSectionRef,
} from '../_components/SuggestedDonationsSection';
import {
  SuggestedTeamSupportSection,
  type SuggestedTeamSupportSectionRef,
} from '../_components/SuggestedTeamSupportSection';
import {
  SuggestedShareCountsSection,
  type SuggestedShareCountsSectionRef,
} from '../_components/SuggestedShareCountsSection';
import {
  ShareLabelsSection,
  type ShareLabelsSectionRef,
} from '../_components/ShareLabelsSection';

// ✅ Enhanced schema with translations
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

  title_en: z.string().min(1, 'English title is required'),
  title_fr: z.string().optional(),
  title_tr: z.string().optional(),
  title_id: z.string().optional(),
  title_pt: z.string().optional(),
  title_es: z.string().optional(),
  title_de: z.string().optional(),
  // per-locale image override — optional. main campaign images[] is the only required media (≥1).
  image_en: z.string().optional(),
  image_fr: z.string().optional(),
  image_tr: z.string().optional(),
  image_id: z.string().optional(),
  image_pt: z.string().optional(),
  image_es: z.string().optional(),
  image_de: z.string().optional(),
  // per-locale video URL override — optional (main videoUrl is also optional).
  videoUrl_en: z.string().optional(),
  videoUrl_fr: z.string().optional(),
  videoUrl_tr: z.string().optional(),
  videoUrl_id: z.string().optional(),
  videoUrl_pt: z.string().optional(),
  videoUrl_es: z.string().optional(),
  videoUrl_de: z.string().optional(),
})
  .superRefine((data, ctx) => {
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
  const [activeTab, setActiveTab] = useState<'ar' | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de'>('ar');
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);
  const [currentAmountUnlocked, setCurrentAmountUnlocked] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockConfirmText, setUnlockConfirmText] = useState('');
  const CURRENT_AMOUNT_UNLOCK_PHRASE = 'أؤكد تعديل المبلغ';
  const suggestedDonationsRef = useRef<SuggestedDonationsSectionRef>(null);
  const suggestedTeamSupportRef = useRef<SuggestedTeamSupportSectionRef>(null);
  const suggestedShareCountsRef = useRef<SuggestedShareCountsSectionRef>(null);
  const shareLabelsRef = useRef<ShareLabelsSectionRef>(null);

  const [descriptionAr, setDescriptionAr] = useState<string | null>(null);
  const [descriptionEn, setDescriptionEn] = useState<string | null>(null);
  const [descriptionFr, setDescriptionFr] = useState<string | null>(null);
  const [descriptionTr, setDescriptionTr] = useState<string | null>(null);
  const [descriptionId, setDescriptionId] = useState<string | null>(null);
  const [descriptionPt, setDescriptionPt] = useState<string | null>(null);
  const [descriptionEs, setDescriptionEs] = useState<string | null>(null);
  const [descriptionDe, setDescriptionDe] = useState<string | null>(null);

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

  const isDescEmpty = (json: string | null) => {
    if (!json) return true;
    try {
      const doc = JSON.parse(json);
      if (!doc.content || doc.content.length === 0) return true;
      return doc.content.every((n: { type: string; content?: unknown[] }) =>
        n.type === 'paragraph' && (!n.content || n.content.length === 0)
      );
    } catch { return true; }
  };

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
      title_en: '',
      title_fr: '',
      title_tr: '',
      title_id: '',
      title_pt: '',
      title_es: '',
      title_de: '',
      image_en: '',
      image_fr: '',
      image_tr: '',
      image_id: '',
      image_pt: '',
      image_es: '',
      image_de: '',
      videoUrl_en: '',
      videoUrl_fr: '',
      videoUrl_tr: '',
      videoUrl_id: '',
      videoUrl_pt: '',
      videoUrl_es: '',
      videoUrl_de: '',
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
    if (isDescEmpty(descriptionEn)) {
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

        // English is always sent (required); other locales only when title + description provided.
        // image/videoUrl per-locale are optional overrides — sent through whenever provided.
        translations: {
          en: {
            title: values.title_en,
            description: descriptionEn,
            image: values.image_en || null,
            videoUrl: values.videoUrl_en || null,
          },
          ...(values.title_fr && !isDescEmpty(descriptionFr)
            ? {
                fr: {
                  title: values.title_fr,
                  description: descriptionFr,
                  image: values.image_fr || null,
                  videoUrl: values.videoUrl_fr || null,
                },
              }
            : {}),
          ...(values.title_tr && !isDescEmpty(descriptionTr)
            ? {
                tr: {
                  title: values.title_tr,
                  description: descriptionTr,
                  image: values.image_tr || null,
                  videoUrl: values.videoUrl_tr || null,
                },
              }
            : {}),
          ...(values.title_id && !isDescEmpty(descriptionId)
            ? {
                id: {
                  title: values.title_id,
                  description: descriptionId,
                  image: values.image_id || null,
                  videoUrl: values.videoUrl_id || null,
                },
              }
            : {}),
          ...(values.title_pt && !isDescEmpty(descriptionPt)
            ? {
                pt: {
                  title: values.title_pt,
                  description: descriptionPt,
                  image: values.image_pt || null,
                  videoUrl: values.videoUrl_pt || null,
                },
              }
            : {}),
          ...(values.title_es && !isDescEmpty(descriptionEs)
            ? {
                es: {
                  title: values.title_es,
                  description: descriptionEs,
                  image: values.image_es || null,
                  videoUrl: values.videoUrl_es || null,
                },
              }
            : {}),
          ...(values.title_de && !isDescEmpty(descriptionDe)
            ? {
                de: {
                  title: values.title_de,
                  description: descriptionDe,
                  image: values.image_de || null,
                  videoUrl: values.videoUrl_de || null,
                },
              }
            : {}),
        },
        suggestedDonations:
          values.fundraisingMode === 'AMOUNT'
            ? suggestedDonationsRef.current?.getPayload()
            : undefined,
        suggestedTeamSupport:
          suggestedTeamSupportRef.current?.getPayload() ?? undefined,
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
  const [uploadingLocale, setUploadingLocale] = useState<
    null | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de'
  >(null);

  type LocaleImageKey =
    | 'image_en' | 'image_fr' | 'image_tr' | 'image_id' | 'image_pt' | 'image_es' | 'image_de';
  type LocaleVideoKey =
    | 'videoUrl_en' | 'videoUrl_fr' | 'videoUrl_tr' | 'videoUrl_id' | 'videoUrl_pt' | 'videoUrl_es' | 'videoUrl_de';

  const handleLocaleImageUpload = async (
    locale: 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de',
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

  const removeLocaleImage = (locale: 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de') => {
    const key = `image_${locale}` as LocaleImageKey;
    const current = form.getValues(key);
    if (current) {
      const publicId = current.split('/').slice(-1)[0]?.split('.')[0];
      if (publicId) axios.delete(`/api/upload?publicId=${publicId}`).catch(() => {});
    }
    form.setValue(key, '', { shouldDirty: true });
  };

  const renderLocaleMedia = (
    locale: 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de',
    labels: { image: string; imageHint: string; video: string; videoHint: string; optionalNote: string },
    direction: 'ltr' | 'rtl' = 'ltr',
  ) => {
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
    const hasEn = !!form.watch('title_en') && !isDescEmpty(descriptionEn);
    const hasFr = !!form.watch('title_fr') && !isDescEmpty(descriptionFr);
    const hasTr = !!form.watch('title_tr') && !isDescEmpty(descriptionTr);
    const hasId = !!form.watch('title_id') && !isDescEmpty(descriptionId);
    const hasPt = !!form.watch('title_pt') && !isDescEmpty(descriptionPt);
    const hasEs = !!form.watch('title_es') && !isDescEmpty(descriptionEs);
    const hasDe = !!form.watch('title_de') && !isDescEmpty(descriptionDe);
    const completed = [hasEn, hasFr, hasTr, hasId, hasPt, hasEs, hasDe].filter(Boolean).length;
    return { completed, total: 7, hasEn, hasFr, hasTr, hasId, hasPt, hasEs, hasDe };
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
            {translationStatus.hasEn && (
              <CheckCircle2 className="w-4 h-4 text-green-600" title="English ready" />
            )}
            {translationStatus.hasFr && <CheckCircle2 className="w-4 h-4 text-brand" title="French ready" />}
            {translationStatus.hasTr && <CheckCircle2 className="w-4 h-4 text-green-600" title="Turkish ready" />}
            {translationStatus.hasId && <CheckCircle2 className="w-4 h-4 text-green-600" title="Indonesian ready" />}
            {translationStatus.hasPt && <CheckCircle2 className="w-4 h-4 text-green-600" title="Portuguese ready" />}
            {translationStatus.hasEs && <CheckCircle2 className="w-4 h-4 text-green-600" title="Spanish ready" />}
            {translationStatus.hasDe && <CheckCircle2 className="w-4 h-4 text-green-600" title="German ready" />}
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
              <TabsList className="flex flex-wrap gap-1 mb-6">
                <TabsTrigger value="ar" className="gap-2">
                  <ReactCountryFlag countryCode="SA" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> العربية
                  <span className="text-xs text-red-600">*</span>
                </TabsTrigger>
                <TabsTrigger value="en" className="gap-2">
                  <ReactCountryFlag countryCode="GB" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> English
                  <span className="text-xs text-red-600">*</span>
                  {translationStatus.hasEn && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
                <TabsTrigger value="fr" className="gap-2">
                  <ReactCountryFlag countryCode="FR" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Français
                  {translationStatus.hasFr && <CheckCircle2 className="w-3 h-3 text-brand" />}
                </TabsTrigger>
                <TabsTrigger value="tr" className="gap-2">
                  <ReactCountryFlag countryCode="TR" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Türkçe
                  {translationStatus.hasTr && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
                <TabsTrigger value="id" className="gap-2">
                  <ReactCountryFlag countryCode="ID" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Bahasa
                  {translationStatus.hasId && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
                <TabsTrigger value="pt" className="gap-2">
                  <ReactCountryFlag countryCode="PT" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Português
                  {translationStatus.hasPt && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
                <TabsTrigger value="es" className="gap-2">
                  <ReactCountryFlag countryCode="ES" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Español
                  {translationStatus.hasEs && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
                <TabsTrigger value="de" className="gap-2">
                  <ReactCountryFlag countryCode="DE" svg style={{width:'1em',height:'1em',verticalAlign:'middle'}} /> Deutsch
                  {translationStatus.hasDe && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                </TabsTrigger>
              </TabsList>

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
                    onDebouncedUpdate={(editor) => setDescriptionAr(JSON.stringify(editor?.getJSON()))}
                    className={editorClassName}
                  />
                  <FormDescription>
                    قدم وصفاً شاملاً للمشروع وأهدافها
                  </FormDescription>
                </FormItem>
              </TabsContent>

              {/* English Tab — required */}
              <TabsContent value="en" className="space-y-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className='mt-[5px]'>
                    English is required. The slug is auto-generated from the English title.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="title_en"
                  render={({ field }) => (
                    <FormItem dir='rtl'>
                      <FormLabel>Campaign Title (English) *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter campaign title in English" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem dir='rtl'>
                  <FormLabel>Campaign Description (English) *</FormLabel>
                  <WysiwygEditor
                    defaultValue={parseEditorContent(descriptionEn)}
                    onDebouncedUpdate={(editor) => setDescriptionEn(JSON.stringify(editor?.getJSON()))}
                    className={editorClassName}
                  />
                  <FormDescription>
                    Required — comprehensive English description of the campaign and its goals.
                  </FormDescription>
                </FormItem>

                {renderLocaleMedia(
                  'en',
                  {
                    image: 'Cover image (English) — optional',
                    imageHint: 'Upload English cover',
                    video: 'Video URL (English) — optional',
                    videoHint: 'Locale-specific video link.',
                    optionalNote:
                      'Image and video URL here are optional overrides — they fall back to the Arabic main cover/video when empty. Only the Arabic main image (≥ 1) is required.',
                  },
                  'ltr',
                )}
              </TabsContent>

              {/* French Tab */}
              <TabsContent value="fr" className="space-y-6">
                <Alert className='flex items-center'>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className='mt-[5px]'>
                    Les traductions françaises sont facultatives. Si elles ne sont pas fournies, le contenu arabe sera affiché aux utilisateurs français.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="title_fr"
                  render={({ field }) => (
                    <FormItem dir='rtl'>
                      <FormLabel>Titre de la campagne (Français)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Entrez le titre de la campagne en français" />
                      </FormControl>
                      <FormDescription>
                        Fournissez une traduction française du titre de la campagne
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormItem dir='rtl'>
                  <FormLabel>Description de la campagne (Français)</FormLabel>
                  <WysiwygEditor
                    defaultValue={parseEditorContent(descriptionFr)}
                    onDebouncedUpdate={(editor) => setDescriptionFr(JSON.stringify(editor?.getJSON()))}
                    className={editorClassName}
                  />
                  <FormDescription>
                    Fournissez une description complète en français de la campagne et de ses objectifs
                  </FormDescription>
                </FormItem>

                {/* Helper for partial translations */}
                {(form.watch('title_fr') || form.watch('description_fr')) &&
                 (!form.watch('title_fr') || !form.watch('description_fr')) && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className='mt-[5px]'>
                      Le titre et la description doivent être fournis pour que la traduction française soit enregistrée.
                    </AlertDescription>
                  </Alert>
                )}

                {renderLocaleMedia(
                  'fr',
                  {
                    image: 'Image de couverture (Français) — facultative',
                    imageHint: 'Téléverser la couverture',
                    video: 'URL vidéo (Français) — facultative',
                    videoHint: 'Lien vidéo spécifique au français.',
                    optionalNote:
                      "Image et URL vidéo facultatives — elles remplacent uniquement la couverture/vidéo arabe lorsqu'elles sont fournies. Seule l'image principale arabe (≥ 1) est requise.",
                  },
                  'ltr',
                )}
              </TabsContent>

              <TabsContent value="tr" className="space-y-6">
                <FormField control={form.control} name="title_tr" render={({ field }) => (
                  <FormItem dir="rtl"><FormLabel>Kampanya Başlığı (Türkçe)</FormLabel><FormControl><Input {...field} placeholder="Türkçe kampanya başlığı" /></FormControl></FormItem>
                )} />
                <FormItem dir="rtl">
                  <FormLabel>Kampanya Açıklaması</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionTr)} onDebouncedUpdate={(editor) => setDescriptionTr(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
                {renderLocaleMedia(
                  'tr',
                  {
                    image: 'Kapak görseli (Türkçe) — isteğe bağlı',
                    imageHint: 'Kapak yükle',
                    video: 'Video URL (Türkçe) — isteğe bağlı',
                    videoHint: 'Türkçeye özel video bağlantısı.',
                    optionalNote:
                      'Görsel ve video URL isteğe bağlıdır — yalnızca verildiğinde Arapça ana görsel/videonun yerine geçer. Yalnızca Arapça ana görsel (≥ 1) zorunludur.',
                  },
                  'ltr',
                )}
              </TabsContent>
              <TabsContent value="id" className="space-y-6">
                <FormField control={form.control} name="title_id" render={({ field }) => (
                  <FormItem dir="rtl"><FormLabel>Judul Kampanye (Indonesia)</FormLabel><FormControl><Input {...field} placeholder="Judul kampanye dalam Bahasa Indonesia" /></FormControl></FormItem>
                )} />
                <FormItem dir="rtl">
                  <FormLabel>Deskripsi Kampanye</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionId)} onDebouncedUpdate={(editor) => setDescriptionId(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
                {renderLocaleMedia(
                  'id',
                  {
                    image: 'Gambar sampul (Indonesia) — opsional',
                    imageHint: 'Unggah sampul',
                    video: 'URL Video (Indonesia) — opsional',
                    videoHint: 'Tautan video khusus untuk Bahasa Indonesia.',
                    optionalNote:
                      'Gambar dan URL video bersifat opsional — hanya menggantikan sampul/video Arab utama jika diisi. Hanya gambar utama Arab (≥ 1) yang wajib.',
                  },
                  'ltr',
                )}
              </TabsContent>
              <TabsContent value="pt" className="space-y-6">
                <FormField control={form.control} name="title_pt" render={({ field }) => (
                  <FormItem dir="rtl"><FormLabel>Título da Campanha (Português)</FormLabel><FormControl><Input {...field} placeholder="Título da campanha em português" /></FormControl></FormItem>
                )} />
                <FormItem dir="rtl">
                  <FormLabel>Descrição da Campanha</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionPt)} onDebouncedUpdate={(editor) => setDescriptionPt(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
                {renderLocaleMedia(
                  'pt',
                  {
                    image: 'Imagem de capa (Português) — opcional',
                    imageHint: 'Enviar capa',
                    video: 'URL do vídeo (Português) — opcional',
                    videoHint: 'Link de vídeo específico para o português.',
                    optionalNote:
                      'A imagem e a URL do vídeo são opcionais — substituem a capa/vídeo árabe principal apenas quando fornecidos. Apenas a imagem principal em árabe (≥ 1) é obrigatória.',
                  },
                  'ltr',
                )}
              </TabsContent>
              <TabsContent value="es" className="space-y-6">
                <FormField control={form.control} name="title_es" render={({ field }) => (
                  <FormItem dir="rtl"><FormLabel>Título de la Campaña (Español)</FormLabel><FormControl><Input {...field} placeholder="Título de la campaña en español" /></FormControl></FormItem>
                )} />
                <FormItem dir="rtl">
                  <FormLabel>Descripción de la Campaña</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionEs)} onDebouncedUpdate={(editor) => setDescriptionEs(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
                {renderLocaleMedia(
                  'es',
                  {
                    image: 'Imagen de portada (Español) — opcional',
                    imageHint: 'Subir portada',
                    video: 'URL del video (Español) — opcional',
                    videoHint: 'Enlace de video específico para el español.',
                    optionalNote:
                      'La imagen y la URL del video son opcionales — reemplazan la portada/video árabe principal solo cuando se proporcionan. Solo la imagen principal en árabe (≥ 1) es obligatoria.',
                  },
                  'ltr',
                )}
              </TabsContent>
              <TabsContent value="de" className="space-y-6">
                <FormField control={form.control} name="title_de" render={({ field }) => (
                  <FormItem dir="rtl"><FormLabel>Kampagnentitel (Deutsch)</FormLabel><FormControl><Input {...field} placeholder="Kampagnentitel auf Deutsch" /></FormControl></FormItem>
                )} />
                <FormItem dir="rtl">
                  <FormLabel>Kampagnenbeschreibung</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionDe)} onDebouncedUpdate={(editor) => setDescriptionDe(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
                {renderLocaleMedia(
                  'de',
                  {
                    image: 'Titelbild (Deutsch) — optional',
                    imageHint: 'Titelbild hochladen',
                    video: 'Video-URL (Deutsch) — optional',
                    videoHint: 'Sprachspezifischer Video-Link für Deutsch.',
                    optionalNote:
                      'Bild und Video-URL sind optional — sie ersetzen das arabische Hauptbild/-video nur, wenn sie angegeben sind. Nur das arabische Hauptbild (≥ 1) ist erforderlich.',
                  },
                  'ltr',
                )}
              </TabsContent>
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
            <div className="mt-6">
              <SuggestedTeamSupportSection
                ref={suggestedTeamSupportRef}
                label="استثناءات قيم دعم الفريق (اختياري)"
                helpText="اتركها فارغة لاستخدام القيم الافتراضية العامة. أرقام مفصولة بفاصلة أو مسافة، مثل: 5, 10, 25, 50, 100"
                defaultPlaceholder="فارغ — يستخدم القيم الافتراضية العامة"
                exceptionsLabel="استثناءات حسب العملة (اختياري)"
                exceptionsEmptyHint="بدون استثناءات، تُطبّق القيم أعلاه (أو الافتراضي العام) على جميع العملات."
              />
            </div>
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
          {(translationStatus.hasEn || translationStatus.hasFr || translationStatus.hasTr || translationStatus.hasId || translationStatus.hasPt || translationStatus.hasEs) && (
            <Card className="p-6 bg-brand/8 border-blue-200">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-brand mt-0.5" />
                <div>
                  <h3 className="font-semibold text-brand mb-2">ملخص الترجمات</h3>
                  <div className="space-y-1 text-sm text-brand">
                    <p>✓ المحتوى العربي: مكتمل (مطلوب)</p>
                    {translationStatus.hasEn && (
                      <p>✓ الترجمة الإنجليزية: مكتملة</p>
                    )}
                    {translationStatus.hasFr && <p>✓ الترجمة الفرنسية: مكتملة</p>}
                    {translationStatus.hasTr && <p>✓ الترجمة التركية: مكتملة</p>}
                    {translationStatus.hasId && <p>✓ الترجمة الإندونيسية: مكتملة</p>}
                    {translationStatus.hasPt && <p>✓ الترجمة البرتغالية: مكتملة</p>}
                    {translationStatus.hasEs && <p>✓ الترجمة الإسبانية: مكتملة</p>}
                    {!translationStatus.hasEn && <p className="text-brand">○ الترجمة الإنجليزية: غير مكتملة (اختياري)</p>}
                    {!translationStatus.hasFr && <p className="text-brand">○ الترجمة الفرنسية: غير مكتملة (اختياري)</p>}
                    {!translationStatus.hasTr && <p className="text-brand">○ الترجمة التركية: غير مكتملة (اختياري)</p>}
                    {!translationStatus.hasId && <p className="text-brand">○ الترجمة الإندونيسية: غير مكتملة (اختياري)</p>}
                    {!translationStatus.hasPt && <p className="text-brand">○ الترجمة البرتغالية: غير مكتملة (اختياري)</p>}
                    {!translationStatus.hasEs && <p className="text-brand">○ الترجمة الإسبانية: غير مكتملة (اختياري)</p>}
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