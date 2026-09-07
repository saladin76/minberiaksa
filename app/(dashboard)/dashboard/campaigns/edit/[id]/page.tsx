'use client';

import ReactCountryFlag from 'react-country-flag';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import axios from 'axios';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldErrors } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { errorMessage } from '@/lib/dashboard/client-error-message';
import { validateImageFile } from '@/lib/uploads/image-file-rules';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Loader2,
  ArrowLeft,
  X,
  Upload,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Languages,
  CheckCircle2,
  Globe,
  Star,
  GripVertical,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ar, enUS, fr } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import {
  parseSuggestedDonations,
  type SuggestedDonationsConfig,
} from '@/lib/campaign/suggested-donations';
import {
  parseSuggestedShareCounts,
  type SuggestedShareCountsConfig,
} from '@/lib/campaign/campaign-modes';
import { EMPTY_TIPTAP_DOC_JSON } from '@/lib/tiptap-empty-doc';
import {
  SuggestedDonationsSection,
  type SuggestedDonationsSectionRef,
} from '../../_components/SuggestedDonationsSection';
import {
  SuggestedTeamSupportSection,
  type SuggestedTeamSupportSectionRef,
} from '../../_components/SuggestedTeamSupportSection';
import {
  parseSuggestedTeamSupport,
  type SuggestedTeamSupportConfig,
} from '@/lib/campaign/suggested-team-support';
import {
  SuggestedShareCountsSection,
  type SuggestedShareCountsSectionRef,
} from '../../_components/SuggestedShareCountsSection';
import {
  ShareLabelsSection,
  type ShareLabelsSectionRef,
} from '../../_components/ShareLabelsSection';
import { parseShareLabels, type ShareLabelsConfig } from '@/lib/campaign/share-labels';

// ✅ Enhanced schema with translations (limits aligned with DB / real data — not stricter than Prisma)
const formSchema = z
  .object({
  title: z.string().min(1, 'العنوان مطلوب').max(2000, 'العنوان طويل جداً'),
  targetAmount: z.coerce.number().min(0).max(1000000),
  goalType: z.enum(['FIXED', 'OPEN']),
  fundraisingMode: z.enum(['AMOUNT', 'SHARES']),
  sharePriceUSD: z.number().min(0).max(1000000).optional(),
  // Many-to-many: the campaign can belong to multiple categories simultaneously.
  categoryIds: z.array(z.string().min(1)).min(1, 'حمله واحدة على الأقل مطلوبة'),
  isActive: z.boolean(),
  images: z.array(z.string())
    .min(1, 'صورة واحدة على الأقل مطلوبة')
    .max(20, 'الحد الأقصى 20 صورة'),
  videoUrl: z.string().optional(),
  currentAmount: z.coerce.number().min(0),
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
        message: 'المبلغ المستهدف مطلوب (≥ 1) عند هدف ثابت',
        path: ['targetAmount'],
      });
    }
    if (data.fundraisingMode === 'SHARES' && (!data.sharePriceUSD || data.sharePriceUSD <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'سعر السهم بالدولار مطلوب لمشاريع السهوم',
        path: ['sharePriceUSD'],
      });
    }
  });

// ✅ Update schema with translations
const updateSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  description: z.string().min(1, 'الوصف مطلوب'),
  videoUrl: z.string().optional(),
  
  // Translations
  title_en: z.string().optional(),
  description_en: z.string().optional(),
  title_fr: z.string().optional(),
  description_fr: z.string().optional(),
  title_tr: z.string().optional(),
  description_tr: z.string().optional(),
  title_id: z.string().optional(),
  description_id: z.string().optional(),
  title_pt: z.string().optional(),
  description_pt: z.string().optional(),
  title_es: z.string().optional(),
  description_es: z.string().optional(),
  title_de: z.string().optional(),
  description_de: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;
type UpdateFormValues = z.infer<typeof updateSchema>;

function firstCampaignFormErrorMessage(errors: FieldErrors<FormValues>): string {
  const stack: unknown[] = [errors];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    const o = cur as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message) return o.message;
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return 'يرجى إكمال الحقول المطلوبة أو تصحيح القيم المرفوضة';
}

function tabForCampaignInvalidField(name: string): 'ar' | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de' {
  if (name === 'title_en' || name === 'image_en' || name === 'videoUrl_en') return 'en';
  if (name.startsWith('title_fr') || name.startsWith('image_fr') || name.startsWith('videoUrl_fr'))
    return 'fr';
  if (name.startsWith('title_tr') || name.startsWith('image_tr') || name.startsWith('videoUrl_tr'))
    return 'tr';
  if (name.startsWith('title_id') || name.startsWith('image_id') || name.startsWith('videoUrl_id'))
    return 'id';
  if (name.startsWith('title_pt') || name.startsWith('image_pt') || name.startsWith('videoUrl_pt'))
    return 'pt';
  if (name.startsWith('title_es') || name.startsWith('image_es') || name.startsWith('videoUrl_es'))
    return 'es';
  if (name.startsWith('title_de') || name.startsWith('image_de') || name.startsWith('videoUrl_de'))
    return 'de';
  return 'ar';
}

interface Category {
  id: string;
  name: string;
}

interface Update {
  id: string;
  title: string;
  description: string;
  image?: string;
  videoUrl?: string;
  createdAt: string;
  translations?: {
    locale: string;
    title: string;
    description: string;
  }[];
}

const getDateLocale = (locale: string) => {
  switch (locale) {
    case 'en': return enUS;
    case 'fr': return fr;
    default: return ar;
  }
};

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const locale = useLocale();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [isEditUpdateDialogOpen, setIsEditUpdateDialogOpen] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<Update | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [uploadingUpdateImage, setUploadingUpdateImage] = useState(false);
  const [updateImage, setUpdateImage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'ar' | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de'>('ar');
  const [updateActiveTab, setUpdateActiveTab] = useState<'ar' | 'en' | 'fr' | 'tr' | 'id' | 'pt' | 'es' | 'de'>('ar');
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [dragOverImageIndex, setDragOverImageIndex] = useState<number | null>(null);
  const [currentAmountUnlocked, setCurrentAmountUnlocked] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockConfirmText, setUnlockConfirmText] = useState('');
  const [originalCurrentAmount, setOriginalCurrentAmount] = useState<number>(0);
  const CURRENT_AMOUNT_UNLOCK_PHRASE = 'أؤكد تعديل المبلغ';
  const [suggestedSeed, setSuggestedSeed] = useState<
    SuggestedDonationsConfig | undefined
  >(undefined);
  const [teamSupportSeed, setTeamSupportSeed] = useState<
    SuggestedTeamSupportConfig | undefined
  >(undefined);
  const [shareCountsSeed, setShareCountsSeed] = useState<
    SuggestedShareCountsConfig | undefined
  >(undefined);
  const [shareLabelsSeed, setShareLabelsSeed] = useState<ShareLabelsConfig | null | undefined>(undefined);
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
      currentAmount: 0,
      categoryIds: [],
      isActive: true,
      images: [],
      videoUrl: '',
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

  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      title: '',
      description: '',
      videoUrl: '',
      title_en: '',
      description_en: '',
      title_fr: '',
      description_fr: '',
      title_tr: '',
      description_tr: '',
      title_id: '',
      description_id: '',
      title_pt: '',
      description_pt: '',
      title_es: '',
      description_es: '',
      title_de: '',
      description_de: '',
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!params?.id) return;
      
      try {
        // `fresh=1` opts this read out of the 5-minute shared cache the public
        // campaign page relies on — the editor must always load what was last
        // saved, not a CDN copy from before the save.
        //
        // The translations call used to run only after these two resolved, for
        // no reason: it depends on neither. Three round trips became one wait.
        const [campaignRes, categoriesRes, allTranslationsRes] = await Promise.all([
          axios.get(`/api/campaigns/${params.id}`, {
            params: { fresh: 1 },
            headers: { 'x-locale': locale },
          }),
          axios.get('/api/categories', {
            headers: { 'x-locale': locale },
          }),
          axios.get(`/api/campaigns/${params.id}/translations`),
        ]);

        const campaign = campaignRes.data;
        setCategories(categoriesRes.data.items);
        setSuggestedSeed(parseSuggestedDonations(campaign.suggestedDonations));
        setTeamSupportSeed(parseSuggestedTeamSupport(campaign.suggestedTeamSupport));
        setShareCountsSeed(parseSuggestedShareCounts(campaign.suggestedShareCounts));
        setShareLabelsSeed(parseShareLabels(campaign.shareLabels));

        const allTranslations = allTranslationsRes.data;

        const getTr = (locale: string) => allTranslations.find((t: any) => t.locale === locale);
        const en = getTr('en'), fr = getTr('fr'), tr = getTr('tr'), id = getTr('id'), pt = getTr('pt'), es = getTr('es'), de = getTr('de');

        const safeGoal = campaign.goalType === 'OPEN' ? 'OPEN' : 'FIXED';
        const safeMode =
          campaign.fundraisingMode === 'SHARES' ? 'SHARES' : 'AMOUNT';
        const imgs = Array.isArray(campaign.images) ? campaign.images : [];
        form.reset({
          title: campaign.title ?? '',
          targetAmount: Number(campaign.targetAmount) || 0,
          goalType: safeGoal,
          fundraisingMode: safeMode,
          sharePriceUSD: Number(campaign.sharePriceUSD) || 0,
          currentAmount: Number(campaign.currentAmount) || 0,
          // Many-to-many: prefer the new `categoryIds` array; fall back to the
          // legacy single `category` for campaigns whose backfill hasn't run.
          categoryIds: Array.isArray(campaign.categoryIds) && campaign.categoryIds.length > 0
            ? campaign.categoryIds
            : (campaign.category?.id ? [campaign.category.id] : []),
          isActive: Boolean(campaign.isActive),
          images: imgs,
          videoUrl: campaign.videoUrl || '',
          // Legacy rows may lack EN; fall back to Arabic title so validation passes until translated.
          title_en: (en?.title && String(en.title).trim()) || (campaign.title && String(campaign.title).trim()) || '',
          title_fr: fr?.title || '',
          title_tr: tr?.title || '',
          title_id: id?.title || '',
          title_pt: pt?.title || '',
          title_es: es?.title || '',
          title_de: de?.title || '',
          image_en: en?.image || '',
          image_fr: fr?.image || '',
          image_tr: tr?.image || '',
          image_id: id?.image || '',
          image_pt: pt?.image || '',
          image_es: es?.image || '',
          image_de: de?.image || '',
          videoUrl_en: en?.videoUrl || '',
          videoUrl_fr: fr?.videoUrl || '',
          videoUrl_tr: tr?.videoUrl || '',
          videoUrl_id: id?.videoUrl || '',
          videoUrl_pt: pt?.videoUrl || '',
          videoUrl_es: es?.videoUrl || '',
          videoUrl_de: de?.videoUrl || '',
        });

        setDescriptionAr(campaign.description || null);
        setDescriptionEn(en?.description || null);
        setDescriptionFr(fr?.description || null);
        setDescriptionTr(tr?.description || null);
        setDescriptionId(id?.description || null);
        setDescriptionPt(pt?.description || null);
        setDescriptionEs(es?.description || null);
        setDescriptionDe(de?.description || null);
        setOriginalCurrentAmount(Number(campaign.currentAmount) || 0);
      } catch (error) {
        console.error('Error fetching campaign:', error);
        toast.error('فشل في تحميل بيانات المشروع');
        router.push('/dashboard/campaigns');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.id, locale, form, router]);

  useEffect(() => {
    const fetchUpdates = async () => {
      if (!params?.id) return;
      try {
        // ✅ Fetch updates with all translations
        const response = await axios.get(`/api/campaigns/${params.id}/updates/all-translations`);
        setUpdates(response.data);
      } catch (error) {
        console.error('Error fetching updates:', error);
        toast.error('فشل في تحميل الإنجازات');
      }
    };

    fetchUpdates();
  }, [params?.id]);

  const onSubmit = async (values: FormValues) => {
    if (!params?.id) return;
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
      // ✅ Prepare request with translations (English always sent — required)
      const willOverrideCurrentAmount =
        currentAmountUnlocked &&
        Number.isFinite(values.currentAmount) &&
        Number(values.currentAmount) !== Number(originalCurrentAmount);
      const requestData: Record<string, unknown> = {
        title: values.title,
        description: descriptionAr || '',
        goalType: values.goalType,
        fundraisingMode: values.fundraisingMode,
        targetAmount: values.goalType === 'OPEN' ? 0 : values.targetAmount,
        sharePriceUSD:
          values.fundraisingMode === 'SHARES' ? values.sharePriceUSD : null,
        categoryIds: values.categoryIds,
        isActive: values.isActive,
        images: values.images,
        videoUrl: values.videoUrl,
        ...(willOverrideCurrentAmount
          ? { currentAmount: Math.max(0, Number(values.currentAmount)) }
          : {}),
        translations: {
          en: {
            title: values.title_en,
            description: descriptionEn ?? EMPTY_TIPTAP_DOC_JSON,
            image: values.image_en ?? '',
            videoUrl: values.videoUrl_en ?? '',
          },
          ...(values.title_fr || !isDescEmpty(descriptionFr) || values.image_fr || values.videoUrl_fr
            ? {
                fr: {
                  title: values.title_fr,
                  description: descriptionFr ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_fr ?? '',
                  videoUrl: values.videoUrl_fr ?? '',
                },
              }
            : {}),
          ...(values.title_tr || !isDescEmpty(descriptionTr) || values.image_tr || values.videoUrl_tr
            ? {
                tr: {
                  title: values.title_tr,
                  description: descriptionTr ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_tr ?? '',
                  videoUrl: values.videoUrl_tr ?? '',
                },
              }
            : {}),
          ...(values.title_id || !isDescEmpty(descriptionId) || values.image_id || values.videoUrl_id
            ? {
                id: {
                  title: values.title_id,
                  description: descriptionId ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_id ?? '',
                  videoUrl: values.videoUrl_id ?? '',
                },
              }
            : {}),
          ...(values.title_pt || !isDescEmpty(descriptionPt) || values.image_pt || values.videoUrl_pt
            ? {
                pt: {
                  title: values.title_pt,
                  description: descriptionPt ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_pt ?? '',
                  videoUrl: values.videoUrl_pt ?? '',
                },
              }
            : {}),
          ...(values.title_es || !isDescEmpty(descriptionEs) || values.image_es || values.videoUrl_es
            ? {
                es: {
                  title: values.title_es,
                  description: descriptionEs ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_es ?? '',
                  videoUrl: values.videoUrl_es ?? '',
                },
              }
            : {}),
          ...(values.title_de || !isDescEmpty(descriptionDe) || values.image_de || values.videoUrl_de
            ? {
                de: {
                  title: values.title_de,
                  description: descriptionDe ?? EMPTY_TIPTAP_DOC_JSON,
                  image: values.image_de ?? '',
                  videoUrl: values.videoUrl_de ?? '',
                },
              }
            : {}),
        },
        suggestedDonations:
          values.fundraisingMode === 'AMOUNT'
            ? suggestedDonationsRef.current?.getPayload()
            : null,
        suggestedTeamSupport: suggestedTeamSupportRef.current?.getPayload() ?? null,
        suggestedShareCounts:
          values.fundraisingMode === 'SHARES'
            ? suggestedShareCountsRef.current?.getPayload()
            : null,
        shareLabels:
          values.fundraisingMode === 'SHARES'
            ? shareLabelsRef.current?.getPayload() ?? null
            : null,
      };

      await axios.put(`/api/campaigns/${params.id}`, requestData);
      toast.success('تم تحديث المشروع بنجاح');
      if (willOverrideCurrentAmount) {
        setOriginalCurrentAmount(Math.max(0, Number(values.currentAmount)));
        setCurrentAmountUnlocked(false);
      }
      //router.push('/dashboard/campaigns');
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast.error(errorMessage(error, 'فشل في تحديث المشروع'));
    } finally {
      setSaving(false);
    }
  };

  const onCampaignFormInvalid = (errors: FieldErrors<FormValues>) => {
    const first = Object.keys(errors)[0];
    if (first) setActiveTab(tabForCampaignInvalidField(first));
    toast.error(firstCampaignFormErrorMessage(errors));
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
                        id={`edit-locale-image-${locale}`}
                        disabled={isUploading}
                      />
                      <label
                        htmlFor={`edit-locale-image-${locale}`}
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
    if (currentImages.length + files.length > 20) {
      toast.error('الحد الأقصى 20 صورة');
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

  const handleUpdateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingUpdateImage(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/api/upload', formData);
      setUpdateImage(response.data.url);
      toast.success('تم رفع الصورة بنجاح');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('فشل في رفع الصورة');
    } finally {
      setUploadingUpdateImage(false);
    }
  };

  const removeUpdateImage = async () => {
    try {
      if (updateImage) {
        const publicId = updateImage.split('/').slice(-1)[0].split('.')[0];
        await axios.delete(`/api/upload?publicId=${publicId}`);
      }
      setUpdateImage("");
      toast.success('تم حذف الصورة بنجاح');
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('فشل في حذف الصورة');
    }
  };

  const handleAddUpdate = async (data: UpdateFormValues) => {
    try {
      setUpdateLoading(true);
      
      // ✅ Prepare update with translations
      const requestData = {
        title: data.title,
        description: data.description,
        image: updateImage,
        videoUrl: data.videoUrl,
        translations: {
          en: { title: data.title_en, description: data.description_en },
          fr: { title: data.title_fr, description: data.description_fr },
          tr: { title: data.title_tr, description: data.description_tr },
          id: { title: data.title_id, description: data.description_id },
          pt: { title: data.title_pt, description: data.description_pt },
          es: { title: data.title_es, description: data.description_es },
          de: { title: data.title_de, description: data.description_de },
        },
      };

      const response = await axios.post(
        `/api/campaigns/${params.id}/updates`,
        requestData
      );

      setUpdates(prev => [response.data, ...prev]);
      updateForm.reset();
      setUpdateImage('');
      setIsUpdateDialogOpen(false);
      setUpdateActiveTab('ar');
      toast.success('تم إضافة التحديث بنجاح');
    } catch (error) {
      console.error('Error adding update:', error);
      toast.error(errorMessage(error, 'فشل في إضافة التحديث'));
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleEditUpdate = async (id: string, data: UpdateFormValues) => {
    setUpdateLoading(true);
    try {
      // ✅ Prepare update with translations
      const requestData = {
        title: data.title,
        description: data.description,
        image: updateImage || selectedUpdate?.image,
        videoUrl: data.videoUrl,
        translations: {
          en: { title: data.title_en, description: data.description_en },
          fr: { title: data.title_fr, description: data.description_fr },
          tr: { title: data.title_tr, description: data.description_tr },
          id: { title: data.title_id, description: data.description_id },
          pt: { title: data.title_pt, description: data.description_pt },
          es: { title: data.title_es, description: data.description_es },
          de: { title: data.title_de, description: data.description_de },
        },
      };

      const response = await axios.patch(
        `/api/campaigns/${params.id}/updates/${id}`,
        requestData
      );
      
      setUpdates(updates.map(update => update.id === id ? response.data : update));
      setIsEditUpdateDialogOpen(false);
      setSelectedUpdate(null);
      setUpdateImage('');
      setUpdateActiveTab('ar');
      toast.success('تم تحديث التحديث بنجاح');
    } catch (error) {
      console.error('Error editing update:', error);
      toast.error(errorMessage(error, 'فشل في تحديث التحديث'));
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDeleteUpdate = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التحديث؟')) return;
    
    try {
      await axios.delete(`/api/campaigns/${params.id}/updates/${id}`);
      setUpdates(updates.filter(update => update.id !== id));
      toast.success('تم حذف التحديث بنجاح');
    } catch (error) {
      console.error('Error deleting update:', error);
      toast.error(errorMessage(error, 'فشل في حذف التحديث'));
    }
  };

  const openEditDialog = (update: Update) => {
    setSelectedUpdate(update);
    
    const getUT = (locale: string) => update.translations?.find(t => t.locale === locale);

    updateForm.reset({
      title: update.title,
      description: update.description,
      videoUrl: update.videoUrl || '',
      title_en: getUT('en')?.title || '',
      description_en: getUT('en')?.description || '',
      title_fr: getUT('fr')?.title || '',
      description_fr: getUT('fr')?.description || '',
      title_tr: getUT('tr')?.title || '',
      description_tr: getUT('tr')?.description || '',
      title_id: getUT('id')?.title || '',
      description_id: getUT('id')?.description || '',
      title_pt: getUT('pt')?.title || '',
      description_pt: getUT('pt')?.description || '',
      title_es: getUT('es')?.title || '',
      description_es: getUT('es')?.description || '',
      title_de: getUT('de')?.title || '',
      description_de: getUT('de')?.description || '',
    });
    
    setUpdateImage(update.image || '');
    setIsEditUpdateDialogOpen(true);
  };

  // ✅ Check translation completeness
  const getTranslationStatus = () => {
    const hasEn = !!form.getValues('title_en') && !isDescEmpty(descriptionEn);
    const hasFr = !!form.getValues('title_fr') && !isDescEmpty(descriptionFr);
    const hasTr = !!form.getValues('title_tr') && !isDescEmpty(descriptionTr);
    const hasId = !!form.getValues('title_id') && !isDescEmpty(descriptionId);
    const hasPt = !!form.getValues('title_pt') && !isDescEmpty(descriptionPt);
    const hasEs = !!form.getValues('title_es') && !isDescEmpty(descriptionEs);
    const hasDe = !!form.getValues('title_de') && !isDescEmpty(descriptionDe);
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">تعديل المشروع</h1>
          <p className="text-gray-600">قم بتحديث معلومات المشروع</p>
          
          {/* ✅ Translation Status Badge */}
          <div className="flex items-center gap-2 mt-2">
            <Globe className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">
              الترجمات: {translationStatus.completed}/{translationStatus.total}
            </span>
            {translationStatus.hasEn && <span title="English available"><CheckCircle2 className="w-4 h-4 text-green-600" /></span>}
            {translationStatus.hasFr && <span title="French available"><CheckCircle2 className="w-4 h-4 text-brand" /></span>}
            {translationStatus.hasTr && <span title="Turkish available"><CheckCircle2 className="w-4 h-4 text-red-500" /></span>}
            {translationStatus.hasId && <span title="Indonesian available"><CheckCircle2 className="w-4 h-4 text-orange-500" /></span>}
            {translationStatus.hasPt && <span title="Portuguese available"><CheckCircle2 className="w-4 h-4 text-green-700" /></span>}
            {translationStatus.hasEs && <span title="Spanish available"><CheckCircle2 className="w-4 h-4 text-yellow-600" /></span>}
            {translationStatus.hasDe && <span title="German available"><CheckCircle2 className="w-4 h-4 text-amber-700" /></span>}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard/campaigns')}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          العودة
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onCampaignFormInvalid)} className="space-y-6">
          {/* ✅ Multi-Language Tabs for Campaign Info */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Languages className="w-5 h-5 text-gray-700" />
              <h2 className="text-lg font-semibold">المعلومات الأساسية</h2>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="flex flex-wrap gap-1 mb-6" dir="rtl">
                <TabsTrigger value="ar" className="gap-2"><ReactCountryFlag countryCode="SA" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> العربية</TabsTrigger>
                <TabsTrigger value="en" className="gap-2"><ReactCountryFlag countryCode="GB" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> English</TabsTrigger>
                <TabsTrigger value="fr" className="gap-2"><ReactCountryFlag countryCode="FR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Français</TabsTrigger>
                <TabsTrigger value="tr" className="gap-2"><ReactCountryFlag countryCode="TR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Türkçe</TabsTrigger>
                <TabsTrigger value="id" className="gap-2"><ReactCountryFlag countryCode="ID" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Bahasa</TabsTrigger>
                <TabsTrigger value="pt" className="gap-2"><ReactCountryFlag countryCode="PT" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Português</TabsTrigger>
                <TabsTrigger value="es" className="gap-2"><ReactCountryFlag countryCode="ES" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Español</TabsTrigger>
                <TabsTrigger value="de" className="gap-2"><ReactCountryFlag countryCode="DE" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Deutsch</TabsTrigger>
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
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>Les traductions françaises sont facultatives. Si elles ne sont pas fournies, le contenu arabe sera affiché.</AlertDescription></Alert>
                <FormField control={form.control} name="title_fr" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Titre de la campagne (Français)</FormLabel><FormControl><Input {...field} placeholder="Entrez le titre de la campagne en français" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Description de la campagne (Français)</FormLabel>
                  <WysiwygEditor defaultValue={parseEditorContent(descriptionFr)} onDebouncedUpdate={(editor) => setDescriptionFr(JSON.stringify(editor?.getJSON()))} className={editorClassName} />
                </FormItem>
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

              {/* Turkish Tab */}
              <TabsContent value="tr" className="space-y-6">
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>Türkçe çeviriler isteğe bağlıdır. Sağlanmazsa Arapça içerik görüntülenecektir.</AlertDescription></Alert>
                <FormField control={form.control} name="title_tr" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Kampanya Başlığı (Türkçe)</FormLabel><FormControl><Input {...field} placeholder="Türkçe kampanya başlığı" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Kampanya Açıklaması (Türkçe)</FormLabel>
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

              {/* Indonesian Tab */}
              <TabsContent value="id" className="space-y-6">
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>Terjemahan Bahasa Indonesia bersifat opsional. Jika tidak disediakan, konten Arab akan ditampilkan.</AlertDescription></Alert>
                <FormField control={form.control} name="title_id" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Judul Kampanye (Indonesia)</FormLabel><FormControl><Input {...field} placeholder="Judul kampanye dalam Bahasa Indonesia" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Deskripsi Kampanye (Indonesia)</FormLabel>
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

              {/* Portuguese Tab */}
              <TabsContent value="pt" className="space-y-6">
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>As traduções em português são opcionais. Se não fornecidas, o conteúdo em árabe será exibido.</AlertDescription></Alert>
                <FormField control={form.control} name="title_pt" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Título da Campanha (Português)</FormLabel><FormControl><Input {...field} placeholder="Título da campanha em português" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Descrição da Campanha (Português)</FormLabel>
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

              {/* Spanish Tab */}
              <TabsContent value="es" className="space-y-6">
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>Las traducciones al español son opcionales. Si no se proporcionan, se mostrará el contenido en árabe.</AlertDescription></Alert>
                <FormField control={form.control} name="title_es" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Título de la Campaña (Español)</FormLabel><FormControl><Input {...field} placeholder="Título de la campaña en español" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Descripción de la Campaña (Español)</FormLabel>
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

              {/* German Tab */}
              <TabsContent value="de" className="space-y-6">
                <Alert><AlertCircle className="h-4 w-4" /><AlertDescription className='mt-[5px]'>Deutsche Übersetzungen sind optional. Wird nichts angegeben, erscheint der arabische Inhalt.</AlertDescription></Alert>
                <FormField control={form.control} name="title_de" render={({ field }) => (
                  <FormItem dir='rtl'><FormLabel>Kampagnentitel (Deutsch)</FormLabel><FormControl><Input {...field} placeholder="Kampagnentitel auf Deutsch" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormItem dir='rtl'>
                  <FormLabel>Kampagnenbeschreibung (Deutsch)</FormLabel>
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
                    <FormItem dir="rtl">
                      <FormLabel>المبلغ المستهدف ($) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                          placeholder="أدخل المبلغ المستهدف ($)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
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
                name="currentAmount"
                render={({ field }) => (
                  <FormItem dir="rtl">
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>المبلغ الحالي</FormLabel>
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
                            form.setValue('currentAmount', originalCurrentAmount);
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
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="المبلغ الحالي"
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
                          أنت الآن تعدّل <strong>المبلغ الحالي</strong> يدوياً. هذه قيمة حساسة تُحدَّث
                          تلقائياً مع التبرعات؛ تجاوزها يدوياً قد يخلق فرقاً مع سجل التبرعات
                          ويظهر للمتبرعين على صفحة المشروع. سيُطبَّق التغيير عند حفظ النموذج.
                          {Number(field.value) !== Number(originalCurrentAmount) && (
                            <span className="block mt-1 font-mono">
                              {originalCurrentAmount.toLocaleString()} -{' '}
                              {Number(field.value || 0).toLocaleString()}
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <FormDescription>
                        يُحدَّث المبلغ الحالي تلقائياً مع التبرعات. يمكن للمسؤول تجاوزه يدوياً
                        بعد تأكيد صريح.
                      </FormDescription>
                    )}
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
                      تأكيد تعديل المبلغ الحالي
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm leading-relaxed text-gray-700">
                    <p>
                      أنت على وشك تعديل <strong>المبلغ الحالي</strong> لهذا المشروع يدوياً.
                      هذا الحقل يُحسب تلقائياً من سجل التبرعات الفعلية.
                    </p>
                    <ul className="list-disc pr-5 space-y-1 text-xs text-gray-600">
                      <li>القيمة الجديدة ستظهر للمتبرعين فوراً على صفحة المشروع.</li>
                      <li>قد يظهر فرق بين هذا المبلغ ومجموع التبرعات في التقارير.</li>
                      <li>يُسجَّل هذا الإجراء في سجل التدقيق (audit log).</li>
                      <li>المبلغ الحالي قبل التعديل: <strong>{originalCurrentAmount.toLocaleString()}</strong></li>
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

              <FormField
                control={form.control}
                name="videoUrl"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>رابط الفيديو (اختياري)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="أدخل رابط الفيديو (YouTube أو Facebook)"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {!loading &&
              shareCountsSeed !== undefined &&
              form.watch('fundraisingMode') === 'SHARES' && (
                <div className="mt-6 space-y-4">
                  <SuggestedShareCountsSection
                    ref={suggestedShareCountsRef}
                    key={`${params?.id}-shares`}
                    initialConfig={shareCountsSeed}
                  />
                  <ShareLabelsSection
                    ref={shareLabelsRef}
                    key={`${params?.id}-share-labels`}
                    initialConfig={shareLabelsSeed ?? null}
                  />
                </div>
              )}
            {!loading &&
              suggestedSeed !== undefined &&
              form.watch('fundraisingMode') === 'AMOUNT' && (
                <div className="mt-6">
                  <SuggestedDonationsSection
                    ref={suggestedDonationsRef}
                    key={`${params?.id}-amount`}
                    initialConfig={suggestedSeed}
                  />
                </div>
              )}
            {!loading && teamSupportSeed !== undefined && (
              <div className="mt-6">
                <SuggestedTeamSupportSection
                  ref={suggestedTeamSupportRef}
                  key={`${params?.id}-team-support`}
                  initialConfig={teamSupportSeed}
                  label="استثناءات قيم دعم الفريق (اختياري)"
                  helpText="اتركها فارغة لاستخدام القيم الافتراضية العامة. أرقام مفصولة بفاصلة أو مسافة، مثل: 5, 10, 25, 50, 100"
                  defaultPlaceholder="فارغ — يستخدم القيم الافتراضية العامة"
                  exceptionsLabel="استثناءات حسب العملة (اختياري)"
                  exceptionsEmptyHint="بدون استثناءات، تُطبّق القيم أعلاه (أو الافتراضي العام) على جميع العملات."
                />
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
                  <FormLabel>صور المشروع</FormLabel>
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
                        {field.value.length < 20 && (
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
                        يمكنك رفع حتى 20 صورة للمشروع. <strong>الصورة الأولى</strong> ستكون الصورة الرئيسية المعروضة.
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
                      تحديد ما إذا كانت المشروع نشطة أم لا
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

          {!form.getValues('isActive') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className='mt-[5px]'>
                تحذير: المشروع غير نشطة حالياً. لن يتمكن المستخدمون من رؤيتها أو التبرع لها.
              </AlertDescription>
            </Alert>
          )}

          {/* SEO الذكي card mounts here via DashboardAutoEnhancements portal. */}
          <div id="dashboard-project-seo-anchor" />

          {/* ✅ Campaign Updates Section with Translations */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">إنجازات المشروع</h2>
              <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" className="gap-2">
                    <Plus className="w-4 h-4" />
                    إضافة تحديث
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>إضافة تحديث جديد</DialogTitle>
                  </DialogHeader>
                  <Form {...updateForm}>
                    <form onSubmit={updateForm.handleSubmit(handleAddUpdate)} className="space-y-4">
                      <Tabs value={updateActiveTab} onValueChange={(v) => setUpdateActiveTab(v as any)}>
                        <TabsList className="flex flex-wrap gap-1">
                          <TabsTrigger value="ar"><ReactCountryFlag countryCode="SA" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> العربية</TabsTrigger>
                          <TabsTrigger value="en"><ReactCountryFlag countryCode="GB" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> English</TabsTrigger>
                          <TabsTrigger value="fr"><ReactCountryFlag countryCode="FR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Français</TabsTrigger>
                          <TabsTrigger value="tr"><ReactCountryFlag countryCode="TR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Türkçe</TabsTrigger>
                          <TabsTrigger value="id"><ReactCountryFlag countryCode="ID" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Bahasa</TabsTrigger>
                          <TabsTrigger value="pt"><ReactCountryFlag countryCode="PT" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Português</TabsTrigger>
                          <TabsTrigger value="es"><ReactCountryFlag countryCode="ES" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Español</TabsTrigger>
                          <TabsTrigger value="de"><ReactCountryFlag countryCode="DE" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Deutsch</TabsTrigger>
                        </TabsList>
                        <TabsContent value="ar" className="space-y-4">
                          <FormField control={updateForm.control} name="title" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>عنوان التحديث *</FormLabel><FormControl><Input {...field} placeholder="أدخل عنوان التحديث" /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>وصف التحديث *</FormLabel><FormControl><Textarea {...field} placeholder="اكتب وصف التحديث..." className="min-h-[100px]" /></FormControl><FormMessage /></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="en" className="space-y-4">
                          <FormField control={updateForm.control} name="title_en" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Update Title (English)</FormLabel><FormControl><Input {...field} placeholder="Enter update title in English" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_en" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Update Description (English)</FormLabel><FormControl><Textarea {...field} placeholder="Write update description in English..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="fr" className="space-y-4">
                          <FormField control={updateForm.control} name="title_fr" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Titre de la mise à jour (Français)</FormLabel><FormControl><Input {...field} placeholder="Entrez le titre en français" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_fr" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Description (Français)</FormLabel><FormControl><Textarea {...field} placeholder="Description en français..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="tr" className="space-y-4">
                          <FormField control={updateForm.control} name="title_tr" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Güncelleme Başlığı (Türkçe)</FormLabel><FormControl><Input {...field} placeholder="Türkçe başlık" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_tr" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Açıklama (Türkçe)</FormLabel><FormControl><Textarea {...field} placeholder="Türkçe açıklama..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="id" className="space-y-4">
                          <FormField control={updateForm.control} name="title_id" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Judul Pembaruan (Indonesia)</FormLabel><FormControl><Input {...field} placeholder="Judul dalam Bahasa Indonesia" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_id" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Deskripsi (Indonesia)</FormLabel><FormControl><Textarea {...field} placeholder="Deskripsi dalam Bahasa Indonesia..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="pt" className="space-y-4">
                          <FormField control={updateForm.control} name="title_pt" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Título da Atualização (Português)</FormLabel><FormControl><Input {...field} placeholder="Título em português" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_pt" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Descrição (Português)</FormLabel><FormControl><Textarea {...field} placeholder="Descrição em português..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="es" className="space-y-4">
                          <FormField control={updateForm.control} name="title_es" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Título de la Actualización (Español)</FormLabel><FormControl><Input {...field} placeholder="Título en español" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_es" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Descripción (Español)</FormLabel><FormControl><Textarea {...field} placeholder="Descripción en español..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                        <TabsContent value="de" className="space-y-4">
                          <FormField control={updateForm.control} name="title_de" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Update-Titel (Deutsch)</FormLabel><FormControl><Input {...field} placeholder="Titel auf Deutsch" /></FormControl></FormItem>
                          )} />
                          <FormField control={updateForm.control} name="description_de" render={({ field }) => (
                            <FormItem dir='rtl'><FormLabel>Beschreibung (Deutsch)</FormLabel><FormControl><Textarea {...field} placeholder="Beschreibung auf Deutsch..." className="min-h-[100px]" /></FormControl></FormItem>
                          )} />
                        </TabsContent>
                      </Tabs>

                      {/* Image Upload Section */}
                      <div className="space-y-4">
                        <label className="block text-sm font-medium text-gray-700">
                          صورة التحديث (اختياري)
                        </label>
                        
                        {updateImage ? (
                          <div className="relative">
                            <img
                              src={updateImage}
                              alt="Update preview"
                              className="h-48 w-full object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={removeUpdateImage}
                              className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleUpdateImageUpload}
                              className="hidden"
                              id="update-image-upload"
                              disabled={uploadingUpdateImage}
                            />
                            <label
                              htmlFor="update-image-upload"
                              className={`flex flex-col items-center justify-center h-32 w-full border-2 border-dashed rounded-lg cursor-pointer hover:border-gray-400 transition-colors ${
                                uploadingUpdateImage ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              {uploadingUpdateImage ? (
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                              ) : (
                                <>
                                  <Upload className="w-6 h-6 text-gray-400" />
                                  <span className="mt-2 text-sm text-gray-500">
                                    اضغط لرفع صورة
                                  </span>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                      </div>

                      <FormField
                        control={updateForm.control}
                        name="videoUrl"
                        render={({ field }) => (
                          <FormItem dir='rtl'>
                            <FormLabel>رابط الفيديو (اختياري)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="أدخل رابط الفيديو" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                   
                      <div className="flex justify-end gap-3 mt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsUpdateDialogOpen(false);
                            updateForm.reset();
                            setUpdateImage('');
                            setUpdateActiveTab('ar');
                          }}
                        >
                          إلغاء
                        </Button>
                        <Button
                          type="submit"
                          className="gap-2"
                          disabled={updateLoading || uploadingUpdateImage}
                        >
                          {(updateLoading || uploadingUpdateImage) && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          إضافة التحديث
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Updates List */}
            <div className="space-y-4">
              {updates.map((update) => {
                const hasTrans = (lc: string) => !!update.translations?.find(t => t.locale === lc)?.title;
                const badges = [
                  { lc: 'en', label: 'EN', cls: 'bg-brand/10 text-brand' },
                  { lc: 'fr', label: 'FR', cls: 'bg-purple-100 text-purple-700' },
                  { lc: 'tr', label: 'TR', cls: 'bg-red-100 text-red-700' },
                  { lc: 'id', label: 'ID', cls: 'bg-orange-100 text-orange-700' },
                  { lc: 'pt', label: 'PT', cls: 'bg-green-100 text-green-700' },
                  { lc: 'es', label: 'ES', cls: 'bg-yellow-100 text-yellow-700' },
                ];

                return (
                  <Card key={update.id} className="">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-lg">{update.title}</h3>
                          <div className="flex gap-1 flex-wrap">
                            {badges.map(b => hasTrans(b.lc) && (
                              <span key={b.lc} className={`text-xs px-2 py-0.5 rounded ${b.cls}`}>{b.label}</span>
                            ))}
                          </div>
                        </div>
                        <p className="text-gray-600">{update.description}</p>
                        {update.image && (
                          <img 
                            src={update.image} 
                            alt={update.title}
                            className="max-w-[200px] rounded-lg"
                          />
                        )}
                        {update.videoUrl && (
                          <div className="text-brand hover:underline">
                            <a href={update.videoUrl} target="_blank" rel="noopener noreferrer">
                              مشاهدة الفيديو
                            </a>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(update.createdAt), 'PPP', { locale: getDateLocale(locale) })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(update)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteUpdate(update.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
              
              {updates.length === 0 && (
                <Card className="p-8 text-center text-gray-500">
                  <p>لا توجد إنجازات بعد. قم بإضافة تحديث لإبقاء المتبرعين على اطلاع.</p>
                </Card>
              )}
            </div>
          </div>

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
              className="bg-brand hover:bg-brand-dark"
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ التغييرات
            </Button>
          </div>
        </form>
      </Form>

      {/* Edit Update Dialog */}
      <Dialog open={isEditUpdateDialogOpen} onOpenChange={setIsEditUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل التحديث</DialogTitle>
          </DialogHeader>
          {selectedUpdate && (
            <Form {...updateForm}>
              <form onSubmit={updateForm.handleSubmit((data) => handleEditUpdate(selectedUpdate.id, data))} className="space-y-4">
                <Tabs value={updateActiveTab} onValueChange={(v) => setUpdateActiveTab(v as any)}>
                  <TabsList className="flex flex-wrap gap-1">
                    <TabsTrigger value="ar"><ReactCountryFlag countryCode="SA" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> العربية</TabsTrigger>
                    <TabsTrigger value="en"><ReactCountryFlag countryCode="GB" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> English</TabsTrigger>
                    <TabsTrigger value="fr"><ReactCountryFlag countryCode="FR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Français</TabsTrigger>
                    <TabsTrigger value="tr"><ReactCountryFlag countryCode="TR" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Türkçe</TabsTrigger>
                    <TabsTrigger value="id"><ReactCountryFlag countryCode="ID" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Bahasa</TabsTrigger>
                    <TabsTrigger value="pt"><ReactCountryFlag countryCode="PT" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Português</TabsTrigger>
                    <TabsTrigger value="es"><ReactCountryFlag countryCode="ES" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Español</TabsTrigger>
                    <TabsTrigger value="de"><ReactCountryFlag countryCode="DE" svg style={{width:"1em",height:"1em",verticalAlign:"middle"}} /> Deutsch</TabsTrigger>
                  </TabsList>
                  <TabsContent value="ar" className="space-y-4">
                    <FormField control={updateForm.control} name="title" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>عنوان التحديث *</FormLabel><FormControl><Input {...field} placeholder="أدخل عنوان التحديث" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>وصف التحديث *</FormLabel><FormControl><Textarea {...field} placeholder="اكتب وصف التحديث..." className="min-h-[100px]" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="en" className="space-y-4">
                    <FormField control={updateForm.control} name="title_en" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Update Title (English)</FormLabel><FormControl><Input {...field} placeholder="Enter update title in English" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_en" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Update Description (English)</FormLabel><FormControl><Textarea {...field} placeholder="Write update description in English..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="fr" className="space-y-4">
                    <FormField control={updateForm.control} name="title_fr" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Titre de la mise à jour (Français)</FormLabel><FormControl><Input {...field} placeholder="Entrez le titre en français" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_fr" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Description (Français)</FormLabel><FormControl><Textarea {...field} placeholder="Description en français..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="tr" className="space-y-4">
                    <FormField control={updateForm.control} name="title_tr" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Güncelleme Başlığı (Türkçe)</FormLabel><FormControl><Input {...field} placeholder="Türkçe başlık" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_tr" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Açıklama (Türkçe)</FormLabel><FormControl><Textarea {...field} placeholder="Türkçe açıklama..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="id" className="space-y-4">
                    <FormField control={updateForm.control} name="title_id" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Judul Pembaruan (Indonesia)</FormLabel><FormControl><Input {...field} placeholder="Judul dalam Bahasa Indonesia" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_id" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Deskripsi (Indonesia)</FormLabel><FormControl><Textarea {...field} placeholder="Deskripsi dalam Bahasa Indonesia..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="pt" className="space-y-4">
                    <FormField control={updateForm.control} name="title_pt" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Título da Atualização (Português)</FormLabel><FormControl><Input {...field} placeholder="Título em português" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_pt" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Descrição (Português)</FormLabel><FormControl><Textarea {...field} placeholder="Descrição em português..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="es" className="space-y-4">
                    <FormField control={updateForm.control} name="title_es" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Título de la Actualización (Español)</FormLabel><FormControl><Input {...field} placeholder="Título en español" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_es" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Descripción (Español)</FormLabel><FormControl><Textarea {...field} placeholder="Descripción en español..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                  <TabsContent value="de" className="space-y-4">
                    <FormField control={updateForm.control} name="title_de" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Update-Titel (Deutsch)</FormLabel><FormControl><Input {...field} placeholder="Titel auf Deutsch" /></FormControl></FormItem>
                    )} />
                    <FormField control={updateForm.control} name="description_de" render={({ field }) => (
                      <FormItem dir='rtl'><FormLabel>Beschreibung (Deutsch)</FormLabel><FormControl><Textarea {...field} placeholder="Beschreibung auf Deutsch..." className="min-h-[100px]" /></FormControl></FormItem>
                    )} />
                  </TabsContent>
                </Tabs>

                {/* Image Section */}
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700">
                    صورة التحديث (اختياري)
                  </label>
                  
                  {updateImage ? (
                    <div className="relative">
                      <img
                        src={updateImage}
                        alt="Update preview"
                        className="h-48 w-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={removeUpdateImage}
                        className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUpdateImageUpload}
                        className="hidden"
                        id="edit-update-image-upload"
                        disabled={uploadingUpdateImage}
                      />
                      <label
                        htmlFor="edit-update-image-upload"
                        className={`flex flex-col items-center justify-center h-32 w-full border-2 border-dashed rounded-lg cursor-pointer hover:border-gray-400 transition-colors ${
                          uploadingUpdateImage ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {uploadingUpdateImage ? (
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-gray-400" />
                            <span className="mt-2 text-sm text-gray-500">
                              اضغط لرفع صورة
                            </span>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                <FormField
                  control={updateForm.control}
                  name="videoUrl"
                  render={({ field }) => (
                    <FormItem dir='rtl'>
                      <FormLabel>رابط الفيديو (اختياري)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="أدخل رابط الفيديو" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-3 mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditUpdateDialogOpen(false);
                      setSelectedUpdate(null);
                      setUpdateImage('');
                      setUpdateActiveTab('ar');
                    }}
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={updateLoading || uploadingUpdateImage}
                  >
                    {(updateLoading || uploadingUpdateImage) && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    حفظ التغييرات
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}