"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, Loader2, Megaphone, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type PageKind = "home" | "campaigns" | "campaign" | "category" | "blog" | "blog_post" | "blog_post_category" | "about_us" | "contact_us" | "profile" | "success" | "success_donation" | "auth_signin";
type LinkMode = "standard" | "marketing";
type MarketingPlatform = "meta" | "google_ads" | "tiktok" | "x" | "twilio_whatsapp" | "twilio_sms" | "twilio_email" | "email" | "whatsapp" | "sms" | "organic";

interface EntityRow { id: string; slug?: string | null; title?: string; name?: string; published?: boolean; supportedLocales: string[]; slugByLocale?: Record<string, string | null>; }
interface Bundle { locales: string[]; currencies: string[]; campaigns: EntityRow[]; categories: EntityRow[]; posts: EntityRow[]; postCategories: EntityRow[]; }
interface ReferralRow { id: string; code: string; name: string | null; }
interface MarketingForm {
  platform: MarketingPlatform;
  autoPlatformData: boolean;
  campaignName: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  placement: string;
  audienceSegment: string;
  messageVariant: string;
  targetCountry: string;
  device: string;
  objective: string;
  customContent: string;
  twilioCampaignId: string;
  twilioTemplateId: string;
  buttonId: string;
  buttonLabel: string;
  internalNotes: string;
}

const PAGE_OPTIONS: { id: PageKind; label: string; hint?: string }[] = [
  { id: "home", label: "الصفحة الرئيسية" },
  { id: "campaigns", label: "قائمة المشاريع", hint: "بحث اختياري" },
  { id: "campaign", label: "صفحة مشروع محددة" },
  { id: "category", label: "صفحة حملة / تصنيف مشاريع" },
  { id: "blog", label: "المدونة" },
  { id: "blog_post", label: "مقال محدد" },
  { id: "blog_post_category", label: "تصنيف مقالات" },
  { id: "about_us", label: "من نحن" },
  { id: "contact_us", label: "اتصل بنا" },
  { id: "profile", label: "ملف المستخدم" },
  { id: "success", label: "صفحة شكر عامة" },
  { id: "success_donation", label: "صفحة شكر لتبرع محدد" },
  { id: "auth_signin", label: "تسجيل الدخول" },
];

const PLATFORM_OPTIONS: { id: MarketingPlatform; label: string; source: string; medium: string; channel: string; hint: string }[] = [
  { id: "meta", label: "Meta / Facebook / Instagram", source: "facebook", medium: "paid_social", channel: "meta_ads", hint: "إعلانات فيسبوك وإنستغرام" },
  { id: "google_ads", label: "Google Ads", source: "google", medium: "paid_search", channel: "google_ads", hint: "بحث، Display، YouTube، Performance Max" },
  { id: "tiktok", label: "TikTok Ads", source: "tiktok", medium: "paid_social", channel: "tiktok_ads", hint: "حملات تيك توك المدفوعة" },
  { id: "x", label: "X Ads", source: "x", medium: "paid_social", channel: "x_ads", hint: "إعلانات منصة X" },
  { id: "twilio_whatsapp", label: "Twilio WhatsApp", source: "twilio", medium: "whatsapp", channel: "twilio_whatsapp", hint: "روابط قوالب ورسائل واتساب عبر Twilio" },
  { id: "twilio_sms", label: "Twilio SMS", source: "twilio", medium: "sms", channel: "twilio_sms", hint: "حملات SMS عبر Twilio" },
  { id: "twilio_email", label: "Twilio Email", source: "twilio", medium: "email", channel: "twilio_email", hint: "رسائل بريدية عبر Twilio / SendGrid" },
  { id: "email", label: "Email", source: "email", medium: "email", channel: "email", hint: "حملات بريدية عامة" },
  { id: "whatsapp", label: "WhatsApp عادي", source: "whatsapp", medium: "messaging", channel: "whatsapp", hint: "مشاركة واتساب بدون Twilio" },
  { id: "sms", label: "SMS عادي", source: "sms", medium: "messaging", channel: "sms", hint: "رسائل قصيرة خارج Twilio" },
  { id: "organic", label: "Organic / مشاركة طبيعية", source: "organic", medium: "organic", channel: "organic", hint: "روابط غير مدفوعة أو مشاركة عضوية" },
];

const initialMarketingForm: MarketingForm = {
  platform: "meta",
  autoPlatformData: false,
  campaignName: "",
  campaignId: "",
  adsetId: "",
  adId: "",
  placement: "",
  audienceSegment: "",
  messageVariant: "",
  targetCountry: "",
  device: "",
  objective: "donations",
  customContent: "",
  twilioCampaignId: "",
  twilioTemplateId: "",
  buttonId: "",
  buttonLabel: "",
  internalNotes: "",
};

function needsResourcePick(kind: PageKind) {
  return kind === "campaign" || kind === "category" || kind === "blog_post" || kind === "blog_post_category";
}

function buildPath(kind: PageKind, opts: { resourceId: string; profileTab: string; donationId: string }): string {
  switch (kind) {
    case "home": return "/";
    case "campaigns": return "/campaigns";
    case "campaign": return `/campaign/${opts.resourceId}`;
    case "category": return `/category/${opts.resourceId}`;
    case "blog": return "/blog";
    case "blog_post": return `/blog/${opts.resourceId}`;
    case "blog_post_category": return `/blog/category/${opts.resourceId}`;
    case "about_us": return "/about-us";
    case "contact_us": return "/contact-us";
    case "profile": return "/profile";
    case "success": return "/success";
    case "success_donation": return `/success/${opts.donationId.trim()}`;
    case "auth_signin": return "/auth/signin";
    default: return "/";
  }
}

function entityLabel(row: EntityRow) {
  const text = (row.title || row.name || row.id).slice(0, 96);
  return row.published === false ? `${text} (مسودة)` : text;
}

function slugifyCampaignName(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9\-\u0600-\u06FF]/gi, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function platformPreset(platform: MarketingPlatform) {
  return PLATFORM_OPTIONS.find((item) => item.id === platform) || PLATFORM_OPTIONS[0];
}

function automaticPlatformValues(platform: MarketingPlatform) {
  if (platform === "meta") return { campaignName: "{{campaign.name}}", campaignId: "{{campaign.id}}", adsetId: "{{adset.id}}", adId: "{{ad.id}}", placement: "{{placement}}", customContent: "{{ad.name}}" };
  if (platform === "google_ads") return { campaignName: "google-campaign-{campaignid}", campaignId: "{campaignid}", adsetId: "{adgroupid}", adId: "{creative}", placement: "{placement}", device: "{device}", customContent: "ad-{creative}" };
  if (platform === "tiktok") return { campaignName: "__CAMPAIGN_NAME__", campaignId: "__CAMPAIGN_ID__", adsetId: "__AID__", adId: "__CID__", placement: "__PLACEMENT__", customContent: "__CID__" };
  if (platform === "x") return { campaignName: "x-campaign", campaignId: "__CAMPAIGN_ID__", adsetId: "__LINE_ITEM_ID__", adId: "__PROMOTED_TWEET_ID__", placement: "x", customContent: "__PROMOTED_TWEET_ID__" };
  return {};
}

function withAutomaticPlatformValues(form: MarketingForm): MarketingForm {
  if (!form.autoPlatformData) return form;
  return { ...form, ...automaticPlatformValues(form.platform) };
}

function makeMarketingParams(form: MarketingForm, loc: string) {
  const effective = withAutomaticPlatformValues(form);
  const preset = platformPreset(effective.platform);
  const campaignSlug = effective.autoPlatformData
    ? (effective.campaignName.trim() || effective.campaignId.trim() || `${preset.channel}-campaign`)
    : (slugifyCampaignName(effective.campaignName) || effective.campaignId.trim() || `${preset.channel}-campaign`);
  const content = effective.customContent.trim() || effective.messageVariant.trim() || effective.adId.trim() || effective.buttonLabel.trim();
  const params: Record<string, string> = {
    utm_source: preset.source,
    utm_medium: preset.medium,
    utm_campaign: campaignSlug,
    channel: preset.channel,
    language: loc,
  };
  if (effective.campaignId.trim()) params.utm_id = effective.campaignId.trim();
  if (content) params.utm_content = content;
  if (effective.audienceSegment.trim()) params.utm_term = effective.audienceSegment.trim();
  if (effective.campaignId.trim()) params.campaign_id = effective.campaignId.trim();
  if (effective.adsetId.trim()) params.adset_id = effective.adsetId.trim();
  if (effective.adId.trim()) params.ad_id = effective.adId.trim();
  if (effective.placement.trim()) params.placement = effective.placement.trim();
  if (effective.device.trim()) params.device = effective.device.trim();
  if (effective.targetCountry.trim()) params.target_country = effective.targetCountry.trim().toUpperCase();
  if (effective.objective.trim()) params.objective = effective.objective.trim();
  if (effective.messageVariant.trim()) params.message_variant = effective.messageVariant.trim();
  if (effective.audienceSegment.trim()) params.audience_segment = effective.audienceSegment.trim();
  if (effective.twilioCampaignId.trim()) params.twilio_campaign_id = effective.twilioCampaignId.trim();
  if (effective.twilioTemplateId.trim()) params.twilio_template_id = effective.twilioTemplateId.trim();
  if (effective.buttonId.trim()) params.button_id = effective.buttonId.trim();
  if (effective.buttonLabel.trim()) params.button_label = effective.buttonLabel.trim();
  if (effective.buttonLabel.trim() || effective.buttonId.trim()) params.link_position = "button";
  return params;
}

function hasUnresolvedMacro(value: string) {
  return /\{\{.+?\}\}|__.+?__|\{campaignid\}|\{adgroupid\}|\{creative\}|\{placement\}|\{device\}/i.test(value);
}

function marketingValidation(form: MarketingForm, loc: string) {
  const params = makeMarketingParams(form, loc);
  const values = Object.values(params).join(" ");
  const issues: { level: "ok" | "warn"; text: string }[] = [];
  const auto = form.autoPlatformData;
  if (auto && ["meta", "google_ads", "tiktok", "x"].includes(form.platform)) issues.push({ level: "ok", text: "تم تفعيل متغيرات المنصة الديناميكية. استخدمها فقط إذا كانت المنصة ستستبدلها عند النقر." });
  if (!auto && !form.campaignName.trim() && !form.campaignId.trim()) issues.push({ level: "warn", text: "أضف اسم الحملة أو Campaign ID حتى يسهل ربط التبرعات بالحملة." });
  if (!auto && ["meta", "google_ads", "tiktok", "x"].includes(form.platform) && !form.campaignId.trim()) issues.push({ level: "warn", text: "الحملة المدفوعة تستفيد من Campaign ID للمطابقة مع بيانات المنصة." });
  if (form.platform.startsWith("twilio") && !form.twilioCampaignId.trim()) issues.push({ level: "warn", text: "أضف Twilio Campaign ID حتى نربط الرسائل بالتبرعات لاحقًا." });
  if (!form.targetCountry.trim()) issues.push({ level: "warn", text: "Target country اختياري لكنه مهم لتحليل الدول والميزانيات." });
  if (!auto && hasUnresolvedMacro(values)) issues.push({ level: "warn", text: "يوجد Macro غير مستبدل؛ لا تستخدمه إلا إذا كانت المنصة ستستبدله فعلًا." });
  if (values.includes("fbclid") || values.includes("gclid")) issues.push({ level: "warn", text: "لا تضف fbclid أو gclid يدويًا؛ المنصات تضيفها تلقائيًا." });
  if (!issues.length) issues.push({ level: "ok", text: "الرابط جاهز للتتبع الآمن." });
  return issues;
}

function trackingHealthScore(form: MarketingForm, loc: string) {
  let score = form.autoPlatformData ? 72 : 35;
  if (form.campaignName.trim() || form.campaignId.trim() || form.autoPlatformData) score += 20;
  if (form.campaignId.trim() || form.autoPlatformData) score += 15;
  if (form.adsetId.trim() || form.autoPlatformData) score += 8;
  if (form.adId.trim() || form.autoPlatformData) score += 7;
  if (form.targetCountry.trim()) score += 6;
  if (form.audienceSegment.trim() || form.messageVariant.trim()) score += 5;
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(loc)) score += 4;
  if (form.platform.startsWith("twilio") && form.twilioCampaignId.trim()) score += 8;
  return Math.max(0, Math.min(100, score));
}

function fieldValue(value: string) {
  return value.trim() || undefined;
}

function pageOptionLabel(kind: PageKind) {
  return PAGE_OPTIONS.find((item) => item.id === kind)?.label || "رابط موقع";
}

export default function LinkGeneratorPage() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkMode>("standard");
  const [pageKind, setPageKind] = useState<PageKind>("home");
  const [resourceId, setResourceId] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [profileTab, setProfileTab] = useState<"account" | "donations" | "support">("account");
  const [donationId, setDonationId] = useState("");
  const [locale, setLocale] = useState("ar");
  const [autoLocale, setAutoLocale] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [autoCurrency, setAutoCurrency] = useState(false);
  const [refCode, setRefCode] = useState("__none__");
  const [openCartPayment, setOpenCartPayment] = useState(false);
  const [marketingForm, setMarketingForm] = useState<MarketingForm>(initialMarketingForm);
  const [lastSavedLink, setLastSavedLink] = useState<{ name: string; mode: LinkMode; copied: boolean; updated: boolean } | null>(null);

  const updateMarketing = (patch: Partial<MarketingForm>) => setMarketingForm((prev) => ({ ...prev, ...patch }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dataRes, refRes] = await Promise.all([fetch("/api/admin/link-generator/data"), fetch("/api/referrals")]);
      if (!dataRes.ok) throw new Error("data");
      const data = (await dataRes.json()) as Bundle;
      setBundle(data);
      if (refRes.ok) {
        const rows = await refRes.json();
        setReferrals(Array.isArray(rows) ? rows : []);
      }
    } catch {
      toast.error("تعذر تحميل بيانات الروابط");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setLinkMode("standard");
    setPageKind("home");
    setResourceId("");
    setCampaignSearch("");
    setProfileTab("account");
    setDonationId("");
    setLocale("ar");
    setAutoLocale(false);
    setCurrency("USD");
    setAutoCurrency(false);
    setRefCode("__none__");
    setOpenCartPayment(false);
    setMarketingForm(initialMarketingForm);
  };

  const resourceList = useMemo(() => {
    if (!bundle) return [];
    if (pageKind === "campaign") return bundle.campaigns;
    if (pageKind === "category") return bundle.categories;
    if (pageKind === "blog_post") return bundle.posts;
    if (pageKind === "blog_post_category") return bundle.postCategories;
    return [];
  }, [bundle, pageKind]);

  const selectedResource = useMemo(() => resourceList.find((row) => row.id === resourceId), [resourceList, resourceId]);
  const detailsOk = useMemo(() => {
    if (needsResourcePick(pageKind)) return Boolean(resourceId);
    if (pageKind === "success_donation") return /^[a-f\d]{24}$/i.test(donationId.trim());
    return true;
  }, [pageKind, resourceId, donationId]);

  const path = useMemo(() => {
    const localeSlug = selectedResource?.slugByLocale?.[locale] ?? null;
    const resourceKey = localeSlug || selectedResource?.slug || resourceId;
    return buildPath(pageKind, { resourceId: resourceKey, profileTab, donationId });
  }, [pageKind, resourceId, selectedResource, profileTab, donationId, locale]);

  const basePath = useMemo(() => {
    const pathPart = path === "/" ? "" : path;
    return autoLocale ? `${pathPart || "/"}` : `/${locale}${pathPart}`;
  }, [path, locale, autoLocale]);

  const selectedPlatform = platformPreset(marketingForm.platform);
  const effectiveMarketingForm = useMemo(() => withAutomaticPlatformValues(marketingForm), [marketingForm]);
  const marketingParams = useMemo(() => linkMode === "marketing" ? makeMarketingParams(marketingForm, autoLocale ? "auto" : locale) : {}, [linkMode, marketingForm, locale, autoLocale]);
  const marketingIssues = useMemo(() => marketingValidation(marketingForm, autoLocale ? "auto" : locale), [marketingForm, locale, autoLocale]);
  const healthScore = useMemo(() => trackingHealthScore(marketingForm, autoLocale ? "auto" : locale), [marketingForm, locale, autoLocale]);

  const fullUrl = useMemo(() => {
    if (!path || !detailsOk) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const pathPart = path === "/" ? "" : path;
    const base = autoLocale ? `${origin}${pathPart || "/"}` : `${origin}/${locale}${pathPart}`;
    const q = new URLSearchParams();
    if (!autoCurrency) q.set("currency", currency);
    if (refCode && refCode !== "__none__") q.set("ref", refCode.toLowerCase());
    if (pageKind === "profile" && profileTab !== "account") q.set("tab", profileTab);
    if (pageKind === "campaigns" && campaignSearch.trim()) q.set("search", campaignSearch.trim());
    if (openCartPayment) q.set("openCartPayment", "1");
    Object.entries(marketingParams).forEach(([key, value]) => q.set(key, value));
    const qs = q.toString();
    return qs ? `${base}?${qs}` : base;
  }, [path, detailsOk, autoLocale, locale, currency, refCode, pageKind, profileTab, campaignSearch, openCartPayment, marketingParams, autoCurrency]);

  async function copyUrl() {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("تم نسخ الرابط");
    } catch {
      toast.error("تعذر النسخ");
    }
  }

  async function saveRegistryLink(copyAfter = false) {
    if (!fullUrl) {
      toast.error("أكمل بيانات الرابط أولًا");
      return;
    }
    setSaving(true);
    try {
      const isMarketingLink = linkMode === "marketing";
      const registryName = isMarketingLink
        ? fieldValue(effectiveMarketingForm.campaignName) || fieldValue(effectiveMarketingForm.campaignId) || marketingParams.utm_campaign || "Marketing link"
        : `${pageOptionLabel(pageKind)}${selectedResource ? ` - ${entityLabel(selectedResource)}` : ""}`;
      const standardPlatform = "ORGANIC";
      const standardChannel = "SITE_LINK";
      const adGroupId = isMarketingLink && effectiveMarketingForm.platform === "google_ads" ? fieldValue(effectiveMarketingForm.adsetId) : undefined;
      const adsetId = isMarketingLink && effectiveMarketingForm.platform !== "google_ads" ? fieldValue(effectiveMarketingForm.adsetId) : undefined;
      const payload = {
        name: registryName,
        platform: isMarketingLink ? effectiveMarketingForm.platform : standardPlatform,
        channel: isMarketingLink ? selectedPlatform.channel : standardChannel,
        url: fullUrl,
        basePath,
        pageKind,
        locale: autoLocale ? "auto" : locale,
        currency: autoCurrency ? "auto" : currency,
        refCode: refCode !== "__none__" ? refCode : undefined,
        utmSource: marketingParams.utm_source,
        utm_source: marketingParams.utm_source,
        utmMedium: marketingParams.utm_medium,
        utm_medium: marketingParams.utm_medium,
        utmCampaign: marketingParams.utm_campaign,
        utm_campaign: marketingParams.utm_campaign,
        utmId: marketingParams.utm_id,
        utm_id: marketingParams.utm_id,
        utmContent: marketingParams.utm_content,
        utm_content: marketingParams.utm_content,
        campaignId: isMarketingLink ? fieldValue(effectiveMarketingForm.campaignId) : undefined,
        campaign_id: isMarketingLink ? fieldValue(effectiveMarketingForm.campaignId) : undefined,
        adGroupId,
        ad_group_id: adGroupId,
        adsetId,
        adset_id: adsetId,
        adId: isMarketingLink ? fieldValue(effectiveMarketingForm.adId) : undefined,
        ad_id: isMarketingLink ? fieldValue(effectiveMarketingForm.adId) : undefined,
        placement: isMarketingLink ? fieldValue(effectiveMarketingForm.placement) : undefined,
        audienceSegment: isMarketingLink ? fieldValue(effectiveMarketingForm.audienceSegment) : undefined,
        audience_segment: isMarketingLink ? fieldValue(effectiveMarketingForm.audienceSegment) : undefined,
        messageVariant: isMarketingLink ? fieldValue(effectiveMarketingForm.messageVariant) : undefined,
        message_variant: isMarketingLink ? fieldValue(effectiveMarketingForm.messageVariant) : undefined,
        targetCountry: isMarketingLink ? fieldValue(effectiveMarketingForm.targetCountry) : undefined,
        target_country: isMarketingLink ? fieldValue(effectiveMarketingForm.targetCountry) : undefined,
        objective: isMarketingLink ? fieldValue(effectiveMarketingForm.objective) : undefined,
        internalNotes: isMarketingLink ? fieldValue(effectiveMarketingForm.internalNotes) : undefined,
        internal_notes: isMarketingLink ? fieldValue(effectiveMarketingForm.internalNotes) : undefined,
        raw: {
          marketingParams,
          pageKind,
          resourceId,
          openCartPayment,
          autoLocale,
          autoCurrency,
          twilioCampaignId: isMarketingLink ? fieldValue(effectiveMarketingForm.twilioCampaignId) : undefined,
          twilioTemplateId: isMarketingLink ? fieldValue(effectiveMarketingForm.twilioTemplateId) : undefined,
          buttonId: isMarketingLink ? fieldValue(effectiveMarketingForm.buttonId) : undefined,
          buttonLabel: isMarketingLink ? fieldValue(effectiveMarketingForm.buttonLabel) : undefined,
        },
      };
      const res = await fetch("/api/admin/marketing-intelligence/campaign-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; upserted?: boolean } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error || "save failed");
      if (copyAfter) await navigator.clipboard.writeText(fullUrl).catch(() => null);
      const updated = data.upserted === false;
      setLastSavedLink({ name: registryName, mode: linkMode, copied: copyAfter, updated });
      toast.success(updated ? "تم تحديث رابط موجود" : "تم حفظ الرابط في سجل الحملات");
    } catch {
      toast.error("فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !bundle) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-brand" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard/referrals" className="hover:text-brand">روابط التتبع</Link>
          <span className="opacity-40">/</span>
          <span className="font-medium text-foreground">منشئ روابط الموقع والحملات</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/marketing-intelligence/campaign-links" className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50">أداء الروابط</Link>
          <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="gap-1.5 text-muted-foreground"><RotateCcw className="h-4 w-4" />مسح الكل</Button>
        </div>
      </div>

      <Card className="overflow-hidden border-brand/15 shadow-md">
        <CardHeader className="bg-gradient-to-l from-brand/8 to-transparent pb-4">
          <CardTitle className="flex items-center gap-2 text-xl"><Link2 className="h-6 w-6 text-brand" />منشئ روابط الموقع والحملات</CardTitle>
          <CardDescription className="leading-relaxed">أنشئ رابط موقع عادي أو رابط حملة تسويقية، واحفظ الروابط التسويقية في Campaign Registry لتحليل الأداء لاحقًا.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-5">
          <section className="space-y-3">
            <Label className="text-base font-semibold">٠ — نوع الرابط</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setLinkMode("standard")} className={cn("rounded-xl border p-4 text-right transition", linkMode === "standard" ? "border-brand bg-blue-50 text-brand" : "border-border bg-white hover:bg-muted/40")}>
                <Link2 className="mb-2 h-5 w-5" /><div className="font-bold">رابط موقع عادي</div><p className="mt-1 text-xs text-muted-foreground">صفحة، لغة، عملة، إحالة.</p>
              </button>
              <button type="button" onClick={() => setLinkMode("marketing")} className={cn("rounded-xl border p-4 text-right transition", linkMode === "marketing" ? "border-brand-orange bg-orange-50 text-[#c7470d]" : "border-border bg-white hover:bg-muted/40")}>
                <Megaphone className="mb-2 h-5 w-5" /><div className="font-bold">حملة تسويقية</div><p className="mt-1 text-xs text-muted-foreground">UTM + بيانات منصة + حفظ في سجل الحملات.</p>
              </button>
            </div>
          </section>

          <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <SelectField label="١ — نوع الصفحة" value={pageKind} onValueChange={(v) => { setPageKind(v as PageKind); setResourceId(""); setCampaignSearch(""); setDonationId(""); }} options={PAGE_OPTIONS.map((p) => ({ value: p.id, label: p.hint ? `${p.label} — ${p.hint}` : p.label }))} />
            {needsResourcePick(pageKind) ? <SelectField label="٢ — المحتوى" value={resourceId} onValueChange={setResourceId} options={resourceList.map((row) => ({ value: row.id, label: entityLabel(row) }))} placeholder="اختر المحتوى" /> : null}
            {pageKind === "campaigns" ? <Field label="بحث في قائمة المشاريع" value={campaignSearch} onChange={setCampaignSearch} placeholder="يضاف كـ search" /> : null}
            {pageKind === "success_donation" ? <Field label="معرف التبرع" value={donationId} onChange={setDonationId} placeholder="24 حرف" dir="ltr" /> : null}
            {pageKind === "profile" ? <SelectField label="تبويب الملف" value={profileTab} onValueChange={(v) => setProfileTab(v as typeof profileTab)} options={[{ value: "account", label: "معلوماتي" }, { value: "donations", label: "التبرعات" }, { value: "support", label: "الدعم" }]} /> : null}
          </section>

          <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <SelectField label="لغة الرابط" value={locale} onValueChange={setLocale} disabled={autoLocale} options={bundle.locales.map((loc) => ({ value: loc, label: loc }))} />
            <SelectField label="العملة" value={currency} onValueChange={setCurrency} disabled={autoCurrency} options={bundle.currencies.filter((c) => c !== "DEFAULT").map((c) => ({ value: c, label: c }))} />
            <CheckRow checked={autoLocale} onChange={setAutoLocale} title="اكتشاف اللغة تلقائيًا" hint="ينشئ الرابط بدون بادئة لغة." />
            <CheckRow checked={autoCurrency} onChange={setAutoCurrency} title="اكتشاف العملة تلقائيًا" hint="ينشئ الرابط بدون currency." />
            <SelectField label="رمز الإحالة" value={refCode} onValueChange={setRefCode} options={[{ value: "__none__", label: "بدون إحالة" }, ...referrals.map((r) => ({ value: r.code, label: r.name ? `${r.code} — ${r.name}` : r.code }))]} />
            <CheckRow checked={openCartPayment} onChange={setOpenCartPayment} title="فتح حوار دفع السلة" hint="يضيف openCartPayment=1." />
          </section>

          {linkMode === "marketing" ? (
            <section className="space-y-4 border-t pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Label className="text-base font-semibold">٤ — إعدادات الحملة التسويقية</Label>
                  <p className="mt-1 text-sm text-muted-foreground">هذه البيانات تحفظ مع الرابط وتساعد صفحة أداء الروابط على مطابقة التبرعات.</p>
                </div>
                <div className={cn("rounded-full border px-3 py-1 text-sm font-bold", healthScore >= 85 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : healthScore >= 65 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700")}>{healthScore}% جاهزية</div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="المنصة / القناة" value={marketingForm.platform} onValueChange={(v) => updateMarketing({ platform: v as MarketingPlatform })} options={PLATFORM_OPTIONS.map((p) => ({ value: p.id, label: p.label }))} hint={selectedPlatform.hint} />
                <CheckRow checked={marketingForm.autoPlatformData} onChange={(checked) => updateMarketing({ autoPlatformData: checked })} title="استخدام متغيرات المنصة الديناميكية" hint="مثل Meta campaign/adset/ad وGoogle ValueTrack." />
                <Field label="اسم الحملة" value={marketingForm.campaignName} onChange={(v) => updateMarketing({ campaignName: v })} placeholder="ramadan-gaza-donations" />
                <Field label="Campaign ID" value={marketingForm.campaignId} onChange={(v) => updateMarketing({ campaignId: v })} placeholder="اختياري لكن مهم للمطابقة" dir="ltr" />
                <Field label="Ad Set / Ad Group ID" value={marketingForm.adsetId} onChange={(v) => updateMarketing({ adsetId: v })} placeholder="adset أو ad group" dir="ltr" />
                <Field label="Ad ID" value={marketingForm.adId} onChange={(v) => updateMarketing({ adId: v })} placeholder="معرف الإعلان" dir="ltr" />
                <Field label="Placement" value={marketingForm.placement} onChange={(v) => updateMarketing({ placement: v })} placeholder="facebook_feed / instagram_reels" />
                <Field label="Target Country" value={marketingForm.targetCountry} onChange={(v) => updateMarketing({ targetCountry: v })} placeholder="TR / DE / US" dir="ltr" />
                <Field label="Audience Segment" value={marketingForm.audienceSegment} onChange={(v) => updateMarketing({ audienceSegment: v })} placeholder="donors_30d / lookalike" />
                <Field label="Message Variant" value={marketingForm.messageVariant} onChange={(v) => updateMarketing({ messageVariant: v })} placeholder="v1_image / v2_video" />
                <Field label="Objective" value={marketingForm.objective} onChange={(v) => updateMarketing({ objective: v })} placeholder="donations" />
                <Field label="Custom Content" value={marketingForm.customContent} onChange={(v) => updateMarketing({ customContent: v })} placeholder="ad name / creative" />
                {marketingForm.platform.startsWith("twilio") ? <Field label="Twilio Campaign ID" value={marketingForm.twilioCampaignId} onChange={(v) => updateMarketing({ twilioCampaignId: v })} dir="ltr" /> : null}
                {marketingForm.platform.startsWith("twilio") ? <Field label="Twilio Template ID" value={marketingForm.twilioTemplateId} onChange={(v) => updateMarketing({ twilioTemplateId: v })} dir="ltr" /> : null}
                <Field label="Button ID" value={marketingForm.buttonId} onChange={(v) => updateMarketing({ buttonId: v })} dir="ltr" />
                <Field label="Button Label" value={marketingForm.buttonLabel} onChange={(v) => updateMarketing({ buttonLabel: v })} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">ملاحظات داخلية</Label>
                <Textarea value={marketingForm.internalNotes} onChange={(event) => updateMarketing({ internalNotes: event.target.value })} placeholder="سبب إنشاء الرابط، مالك الحملة، أو ملاحظة مراجعة قبل الإطلاق." className="min-h-24 resize-y" />
              </div>
              <div className="grid gap-2">
                {marketingIssues.map((issue, index) => (
                  <Alert key={`${issue.text}-${index}`} className={issue.level === "warn" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}>
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle>{issue.level === "warn" ? "تنبيه" : "جيد"}</AlertTitle>
                    <AlertDescription>{issue.text}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 border-t pt-5">
            <Label className="text-base font-semibold">٥ — الرابط النهائي</Label>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div dir="ltr" className="min-h-[3rem] break-all rounded-lg bg-white p-3 text-left font-mono text-sm text-slate-700">{fullUrl || "أكمل البيانات لظهور الرابط"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={copyUrl} disabled={!fullUrl} className="gap-2"><Copy className="h-4 w-4" />نسخ الرابط</Button>
              <Button type="button" onClick={() => saveRegistryLink(false)} disabled={!fullUrl || saving} variant="outline" className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save to Campaign Registry</Button>
              <Button type="button" onClick={() => saveRegistryLink(true)} disabled={!fullUrl || saving} className="gap-2 bg-brand-orange hover:bg-[#d94c12]">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ ونسخ الرابط</Button>
              {fullUrl ? <Button asChild type="button" variant="secondary" className="gap-2"><a href={fullUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />فتح</a></Button> : null}
            </div>
            {lastSavedLink ? (
              <Alert className="border-emerald-200 bg-emerald-50">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>{lastSavedLink.updated ? "تم تحديث رابط موجود" : "تم حفظ الرابط في سجل الحملات"}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <span className="block">
                    {lastSavedLink.name} · {lastSavedLink.mode === "marketing" ? "رابط حملة" : "رابط موقع"}{lastSavedLink.copied ? " · تم نسخه أيضًا" : ""}
                  </span>
                  <Link href="/dashboard/marketing/campaign-links" className="inline-flex text-xs font-semibold text-emerald-800 underline-offset-4 hover:underline">
                    Open in Campaign Registry
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, dir }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; dir?: "rtl" | "ltr" }) {
  return <div className="space-y-2"><Label className="text-sm text-muted-foreground">{label}</Label><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-10", dir === "ltr" && "font-mono text-sm text-left")} dir={dir || "rtl"} /></div>;
}

function SelectField({ label, value, onValueChange, options, placeholder = "اختر", disabled, hint }: { label: string; value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; hint?: string }) {
  return <div className="space-y-2"><Label className="text-sm text-muted-foreground">{label}</Label><Select value={value} onValueChange={onValueChange} disabled={disabled}><SelectTrigger className="h-10"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

function CheckRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (checked: boolean) => void; title: string; hint: string }) {
  return <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50"><Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" /><span className="text-sm leading-snug">{title}<span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span></span></label>;
}
