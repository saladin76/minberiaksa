"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
import { blockedTrackingMacros, campaignSlug, hasTrackingMacros, serializeAdParameters } from "@/lib/marketing/tracking-link-policy";
import { cn } from "@/lib/utils";
import { SLUGS, type MinbarRoute } from "@/lib/minbar/routes";
import { dashDir, dt } from "@/lib/dashboard/i18n";

type PageKind = "home" | "campaigns" | "campaign" | "category" | "super_category" | "blog" | "blog_post" | "blog_post_category" | "about_us" | "contact_us" | "profile" | "success" | "success_donation" | "auth_signin" | "zakat" | "zakat_calculator" | "waqf" | "recurring" | "aqsa" | "jerusalem" | "reports" | "news" | "programs" | "achievement_videos" | "endorsement_videos" | "publications" | "courses" | "volunteer" | "partner" | "bank_accounts" | "cart";
type LinkMode = "standard" | "marketing";
type MarketingPlatform = "meta" | "google_ads" | "tiktok" | "x" | "email" | "whatsapp" | "sms" | "organic";

interface EntityRow { id: string; slug?: string | null; title?: string; name?: string; published?: boolean; supportedLocales: string[]; slugByLocale?: Record<string, string | null>; }
interface Bundle { locales: string[]; currencies: string[]; campaigns: EntityRow[]; categories: EntityRow[]; superCategories: EntityRow[]; posts: EntityRow[]; postCategories: EntityRow[]; }
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
  messagingCampaignId: string;
  messagingTemplateId: string;
  buttonId: string;
  buttonLabel: string;
  internalNotes: string;
}

const PAGE_OPTIONS: { id: PageKind; label: string; hint?: string }[] = [
  { id: "home", get label() { return dt("الصفحة الرئيسية"); } },
  { id: "campaigns", get label() { return dt("قائمة المشاريع"); }, get hint() { return dt("بحث اختياري"); } },
  { id: "campaign", get label() { return dt("صفحة مشروع محددة"); } },
  { id: "category", get label() { return dt("تصنيف مشاريع"); } },
  { id: "super_category", get label() { return dt("قسم كبير / صفحة برنامج رئيسية"); } },
  { id: "blog", get label() { return dt("المدونة"); } },
  { id: "blog_post", get label() { return dt("مقال محدد"); } },
  { id: "blog_post_category", get label() { return dt("تصنيف مقالات"); } },
  { id: "about_us", get label() { return dt("من نحن"); } },
  { id: "contact_us", get label() { return dt("اتصل بنا"); } },
  { id: "profile", get label() { return dt("ملف المستخدم"); } },
  { id: "success", get label() { return dt("صفحة شكر عامة"); } },
  { id: "success_donation", get label() { return dt("صفحة شكر لتبرع محدد"); } },
  { id: "auth_signin", get label() { return dt("تسجيل الدخول"); } },
  { id: "zakat", get label() { return dt("التبرع بالزكاة"); } },
  { id: "zakat_calculator", get label() { return dt("حاسبة الزكاة"); } },
  { id: "waqf", get label() { return dt("مشاريع الوقف"); } },
  { id: "recurring", get label() { return dt("التبرع الدوري"); } },
  { id: "aqsa", get label() { return dt("المسجد الأقصى"); } },
  { id: "jerusalem", get label() { return dt("القدس والبلدة القديمة"); } },
  { id: "reports", get label() { return dt("الإنجازات والتقارير"); } },
  { id: "news", get label() { return dt("الأخبار"); } },
  { id: "programs", get label() { return dt("البرامج المصورة"); } },
  { id: "achievement_videos", get label() { return dt("الإنجازات بالفيديو"); } },
  { id: "endorsement_videos", get label() { return dt("التزكيات بالفيديو"); } },
  { id: "publications", get label() { return dt("إصدارات المؤسسة"); } },
  { id: "courses", get label() { return dt("الدورات"); } },
  { id: "volunteer", get label() { return dt("التطوع"); } },
  { id: "partner", get label() { return dt("كن شريكًا"); } },
  { id: "bank_accounts", get label() { return dt("الحسابات البنكية"); } },
  { id: "cart", get label() { return dt("سلة التبرعات"); } },
];

const PLATFORM_OPTIONS: { id: MarketingPlatform; label: string; source: string; medium: string; channel: string; hint: string }[] = [
  { id: "meta", label: "Meta / Facebook / Instagram", source: "facebook", medium: "paid_social", channel: "meta_ads", get hint() { return dt("إعلانات فيسبوك وإنستغرام"); } },
  { id: "google_ads", label: "Google Ads", source: "google", medium: "paid_search", channel: "google_ads", get hint() { return dt("بحث، Display، YouTube، Performance Max"); } },
  { id: "tiktok", label: "TikTok Ads", source: "tiktok", medium: "paid_social", channel: "tiktok_ads", get hint() { return dt("حملات تيك توك المدفوعة"); } },
  { id: "x", label: "X Ads", source: "x", medium: "paid_social", channel: "x_ads", get hint() { return dt("إعلانات منصة X"); } },
  { id: "email", label: "Email", source: "email", medium: "email", channel: "email", get hint() { return dt("حملات البريد عبر نظام التواصل"); } },
  { id: "whatsapp", label: "WhatsApp", source: "whatsapp", medium: "messaging", channel: "whatsapp", get hint() { return dt("حملات واتساب عبر Meta Cloud API أو روابط مشاركة"); } },
  { id: "sms", label: "SMS", source: "sms", medium: "messaging", channel: "sms", get hint() { return dt("حملات الرسائل النصية عبر نظام التواصل"); } },
  { id: "organic", get label() { return dt("Organic / مشاركة طبيعية"); }, source: "organic", medium: "organic", channel: "organic", get hint() { return dt("روابط غير مدفوعة أو مشاركة عضوية"); } },
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
  messagingCampaignId: "",
  messagingTemplateId: "",
  buttonId: "",
  buttonLabel: "",
  internalNotes: "",
};

function needsResourcePick(kind: PageKind) {
  return kind === "campaign" || kind === "category" || kind === "super_category" || kind === "blog_post" || kind === "blog_post_category";
}

const STATIC_DESTINATIONS: Partial<Record<PageKind, MinbarRoute>> = {
  zakat: "zakat", zakat_calculator: "zakatCalculator", waqf: "waqf",
  recurring: "recurring", aqsa: "aqsa", jerusalem: "jerusalem",
  reports: "reports", news: "news", programs: "programs",
  achievement_videos: "achievementVideos", endorsement_videos: "endorsementVideos",
  publications: "publications", courses: "courses", volunteer: "volunteer",
  partner: "partner", bank_accounts: "bankAccounts", cart: "cart",
};

function buildPath(kind: PageKind, opts: { resourceId: string; profileTab: string; donationId: string }): string {
  const mapped = STATIC_DESTINATIONS[kind];
  if (mapped) return `/${SLUGS[mapped]}`;
  switch (kind) {
    case "home": return "/";
    case "campaigns": return "/bagislar";
    case "campaign": return `/bagislar/${encodeURIComponent(opts.resourceId)}`;
    case "super_category": return `/bagislar/${encodeURIComponent(opts.resourceId)}`;
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
  return row.published === false ? dt("{0} (مسودة)", [text]) : text;
}

function slugifyCampaignName(value: string) { return campaignSlug(value); }

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
  if (effective.messagingCampaignId.trim()) params.messaging_campaign_id = effective.messagingCampaignId.trim();
  if (effective.messagingTemplateId.trim()) params.messaging_template_id = effective.messagingTemplateId.trim();
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
  if (auto && ["meta", "google_ads", "tiktok", "x"].includes(form.platform)) issues.push({ level: "ok", text: dt("تم تفعيل متغيرات المنصة الديناميكية. استخدمها فقط إذا كانت المنصة ستستبدلها عند النقر.") });
  if (!auto && !form.campaignName.trim() && !form.campaignId.trim()) issues.push({ level: "warn", text: dt("أضف اسم الحملة أو Campaign ID حتى يسهل ربط التبرعات بالحملة.") });
  if (!auto && ["meta", "google_ads", "tiktok", "x"].includes(form.platform) && !form.campaignId.trim()) issues.push({ level: "warn", text: dt("الحملة المدفوعة تستفيد من Campaign ID للمطابقة مع بيانات المنصة.") });
  if (!form.targetCountry.trim()) issues.push({ level: "warn", text: dt("Target country اختياري لكنه مهم لتحليل الدول والميزانيات.") });
  if (!auto && hasUnresolvedMacro(values)) issues.push({ level: "warn", text: dt("يوجد Macro غير مستبدل؛ لا تستخدمه إلا إذا كانت المنصة ستستبدله فعلًا.") });
  if (values.includes("fbclid") || values.includes("gclid")) issues.push({ level: "warn", text: dt("لا تضف fbclid أو gclid يدويًا؛ المنصات تضيفها تلقائيًا.") });
  if (!issues.length) issues.push({ level: "ok", text: dt("الرابط جاهز للتتبع الآمن.") });
  return issues;
}


function fieldValue(value: string) { return value.trim() || undefined; }

function identifierValue(value: string) {
  const text = value.trim();
  return text && !hasTrackingMacros(text) ? text : undefined;
}

function pageOptionLabel(kind: PageKind) {
  return PAGE_OPTIONS.find((item) => item.id === kind)?.label || dt("رابط موقع");
}

export default function TrackingLinkBuilder() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkMode>("marketing");
  const [pageKind, setPageKind] = useState<PageKind>("home");
  const [resourceId, setResourceId] = useState("");
  const [campaignSearch, setCampaignSearch] = useState("");
  const [resourceSearch, setResourceSearch] = useState("");
  const [profileTab, setProfileTab] = useState<"account" | "donations" | "support">("account");
  const [donationId, setDonationId] = useState("");
  const [locale, setLocale] = useState("ar");
  const [autoLocale, setAutoLocale] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [autoCurrency, setAutoCurrency] = useState(true);
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
      toast.error(dt("تعذر تحميل بيانات الروابط"));
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => {
    setLastSavedLink(null);
    setLinkMode("marketing");
    setPageKind("home");
    setResourceId("");
    setCampaignSearch("");
    setResourceSearch("");
    setProfileTab("account");
    setDonationId("");
    setLocale("ar");
    setAutoLocale(false);
    setCurrency("USD");
    setAutoCurrency(true);
    setRefCode("__none__");
    setOpenCartPayment(false);
    setMarketingForm(initialMarketingForm);
  };

  const resourceList = useMemo(() => {
    if (!bundle) return [];
    if (pageKind === "campaign") return bundle.campaigns.filter(row => row.published !== false);
    if (pageKind === "category") return bundle.categories.filter(row => row.published !== false);
    if (pageKind === "super_category") return (bundle.superCategories || []).filter(row => row.published !== false);
    if (pageKind === "blog_post") return bundle.posts.filter(row => row.published !== false);
    if (pageKind === "blog_post_category") return bundle.postCategories.filter(row => row.published !== false);
    return [];
  }, [bundle, pageKind]);

  const filteredResources = useMemo(() => {
    const search = resourceSearch.trim().toLocaleLowerCase();
    return search ? resourceList.filter(row =>
      (row.title || row.name || row.slug || row.id).toLocaleLowerCase().includes(search)
    ) : resourceList;
  }, [resourceList, resourceSearch]);
  const selectedResource = useMemo(() => resourceList.find((row) => row.id === resourceId), [resourceList, resourceId]);
  const detailsOk = useMemo(() => {
    if (needsResourcePick(pageKind)) return Boolean(selectedResource);
    if (pageKind === "success_donation") return /^[a-f\d]{24}$/i.test(donationId.trim());
    return true;
  }, [pageKind, selectedResource, donationId]);

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

  useEffect(() => { setLastSavedLink(null); }, [fullUrl, marketingForm]);

  const dynamicTemplate = linkMode === "marketing" && marketingForm.autoPlatformData;
  const adParameters = serializeAdParameters(marketingParams);
  const destinationUrl = useMemo(() => {
    if (!fullUrl) return "";
    try {
      const url = new URL(fullUrl);
      Object.keys(marketingParams).forEach(key => url.searchParams.delete(key));
      return url.toString();
    } catch { return ""; }
  }, [fullUrl, marketingParams]);
  const blockedMacros = blockedTrackingMacros(fullUrl + " " + marketingForm.campaignName);
  const unintendedMacros = linkMode === "marketing" && !dynamicTemplate && hasTrackingMacros(fullUrl + " " + marketingForm.campaignName);
  const needsCampaignName = linkMode === "marketing" && !dynamicTemplate && !marketingForm.campaignName.trim() && !marketingForm.campaignId.trim();
  const canUseLink = Boolean(fullUrl) && !needsCampaignName && !blockedMacros.length && !unintendedMacros;
  const copyValue = dynamicTemplate ? adParameters : fullUrl;
  async function copyText(value: string) {
    if (!value || !canUseLink) return;
    try { await navigator.clipboard.writeText(value); toast.success(dt("تم النسخ")); }
    catch { toast.error(dt("تعذر النسخ؛ يمكنك تحديد النص ونسخه يدويًا.")); }
  }

  async function copyUrl() {
    if (!canUseLink) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      toast.success(dt("تم نسخ الرابط"));
    } catch {
      toast.error(dt("تعذر النسخ"));
    }
  }

  async function saveRegistryLink(copyAfter = false) {
    if (!canUseLink) {
      toast.error(dt("أكمل بيانات الرابط أولًا"));
      return;
    }
    setSaving(true);
    try {
      const isMarketingLink = linkMode === "marketing";
      const registryName = isMarketingLink
        ? identifierValue(marketingForm.campaignName) || identifierValue(effectiveMarketingForm.campaignId) || (dynamicTemplate ? dt("قالب إعلان {0}", [selectedPlatform.label]) : marketingParams.utm_campaign) || "Marketing link"
        : `${pageOptionLabel(pageKind)}${selectedResource ? ` - ${entityLabel(selectedResource)}` : ""}`;
      const standardPlatform = "ORGANIC";
      const standardChannel = "SITE_LINK";
      const adGroupId = isMarketingLink && effectiveMarketingForm.platform === "google_ads" ? identifierValue(effectiveMarketingForm.adsetId) : undefined;
      const adsetId = isMarketingLink && effectiveMarketingForm.platform !== "google_ads" ? identifierValue(effectiveMarketingForm.adsetId) : undefined;
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
        campaignId: isMarketingLink ? identifierValue(effectiveMarketingForm.campaignId) : undefined,
        campaign_id: isMarketingLink ? identifierValue(effectiveMarketingForm.campaignId) : undefined,
        adGroupId,
        ad_group_id: adGroupId,
        adsetId,
        adset_id: adsetId,
        adId: isMarketingLink ? identifierValue(effectiveMarketingForm.adId) : undefined,
        ad_id: isMarketingLink ? identifierValue(effectiveMarketingForm.adId) : undefined,
        placement: isMarketingLink ? identifierValue(effectiveMarketingForm.placement) : undefined,
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
          autoPlatformData: dynamicTemplate,
          destinationUrl,
          adParameters: dynamicTemplate ? adParameters : undefined,
          pageKind,
          resourceId,
          openCartPayment,
          autoLocale,
          autoCurrency,
          messagingCampaignId: isMarketingLink ? fieldValue(effectiveMarketingForm.messagingCampaignId) : undefined,
          messagingTemplateId: isMarketingLink ? fieldValue(effectiveMarketingForm.messagingTemplateId) : undefined,
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
      let copied = false;
      if (copyAfter) {
        try { await navigator.clipboard.writeText(copyValue); copied = true; } catch { /* Saving succeeded; the clipboard is a separate capability. */ }
      }
      const updated = data.upserted === false;
      setLastSavedLink({ name: registryName, mode: linkMode, copied, updated });
      window.dispatchEvent(new Event("campaign-links:updated"));
      if (copyAfter && !copied) toast.error(dt("تم حفظ الرابط، لكن تعذّر نسخه. استخدم زر نسخ الرابط أو انسخه يدويًا."));
      else toast.success(updated ? dt("تم تحديث رابط موجود") : dt("تم حفظ الرابط في سجل الحملات"));
    } catch {
      toast.error(dt("فشل الحفظ"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div role="status" aria-label={dt("جارٍ تحميل بيانات الروابط")} className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-brand" /></div>;
  }

  if (!bundle) return <div role="alert" className="rounded-xl border bg-white p-6 text-center"><p>{dt("تعذر تحميل بيانات الروابط")}</p><Button type="button" variant="outline" onClick={load} className="mt-4">{dt("إعادة المحاولة")}</Button></div>;

  return (
    <div className="space-y-5" dir={dashDir()}>
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{dt("اختر الوجهة ومصدر الزيارة، ثم انسخ الرابط.")}</p><Button type="button" variant="ghost" size="sm" onClick={resetForm} className="shrink-0 gap-1.5"><RotateCcw className="h-4 w-4" />{dt("إعادة الضبط")}</Button></div>

      <Card className="overflow-hidden border-slate-200 shadow-none">
        <CardHeader className="border-b bg-slate-50/60 pb-4">
          <CardTitle className="flex items-center gap-2 text-xl"><Link2 className="h-6 w-6 text-brand" />{dt("إعداد الرابط")}</CardTitle>
          <CardDescription className="leading-relaxed">{dt("ثلاث خطوات: الوجهة، مصدر الزيارة، ثم الحفظ والنسخ.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid items-start gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
          <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <Label className="text-base font-semibold">{dt("١ · استخدام الرابط")}</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" aria-pressed={linkMode === "standard"} onClick={() => setLinkMode("standard")} className={cn("rounded-xl border p-4 text-start transition", linkMode === "standard" ? "border-brand bg-blue-50 text-brand" : "border-border bg-white hover:bg-muted/40")}>
                <Link2 className="mb-2 h-5 w-5" /><div className="font-bold">{dt("مشاركة مباشرة")}</div><p className="mt-1 text-xs text-muted-foreground">{dt("رابط بسيط للمشاركة دون بيانات حملة.")}</p>
              </button>
              <button type="button" aria-pressed={linkMode === "marketing"} onClick={() => setLinkMode("marketing")} className={cn("rounded-xl border p-4 text-start transition", linkMode === "marketing" ? "border-brand-orange bg-orange-50 text-[#8f3a23]" : "border-border bg-white hover:bg-muted/40")}>
                <Megaphone className="mb-2 h-5 w-5" /><div className="font-bold">{dt("تتبع حملة")}</div><p className="mt-1 text-xs text-muted-foreground">{dt("اربط التبرعات بحملة إعلانية أو رسالة تسويقية.")}</p>
              </button>
            </div>
          </section>

          <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <SelectField label={dt("٢ · الوجهة")} value={pageKind} onValueChange={(v) => { setPageKind(v as PageKind); setResourceId(""); setResourceSearch(""); setCampaignSearch(""); setDonationId(""); }} options={PAGE_OPTIONS.map((p) => ({ value: p.id, label: p.hint ? `${p.label}  ${p.hint}` : p.label }))} />
            {needsResourcePick(pageKind) ? (
              <div className="space-y-2">
                <Field label={dt("ابحث عن المشروع أو القسم أو المحتوى")} value={resourceSearch} onChange={setResourceSearch} placeholder={dt("اكتب الاسم لتصفية الخيارات")} />
                <SelectField label={dt("المشروع أو القسم أو المحتوى")} value={resourceId} onValueChange={setResourceId} options={filteredResources.map((row) => ({ value: row.id, label: entityLabel(row) }))} placeholder={dt("اختر المحتوى")} />
                <p className="text-xs text-muted-foreground">{dt("عدد النتائج")}: {filteredResources.length}</p>
              </div>
            ) : null}
            {pageKind === "campaigns" ? <Field label={dt("بحث في قائمة المشاريع")} value={campaignSearch} onChange={setCampaignSearch} placeholder={dt("يضاف كـ search")} /> : null}
            {pageKind === "success_donation" ? <Field label={dt("معرف التبرع")} value={donationId} onChange={setDonationId} placeholder={dt("24 حرف")} dir="ltr" /> : null}
            {pageKind === "profile" ? <SelectField label={dt("تبويب الملف")} value={profileTab} onValueChange={(v) => setProfileTab(v as typeof profileTab)} options={[{ value: "account", label: dt("معلوماتي") }, { value: "donations", label: dt("التبرعات") }, { value: "support", label: dt("الدعم") }]} /> : null}
          </section>

          <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <SelectField label={dt("لغة الرابط")} value={locale} onValueChange={setLocale} disabled={autoLocale} options={bundle.locales.map((loc) => ({ value: loc, label: loc }))} />
            <SelectField label={dt("العملة")} value={currency} onValueChange={setCurrency} disabled={autoCurrency} options={bundle.currencies.filter((c) => c !== "DEFAULT").map((c) => ({ value: c, label: c }))} />
            <CheckRow checked={autoLocale} onChange={setAutoLocale} title={dt("لغة الزائر تلقائيًا")} hint={dt("يفتح الموقع باللغة المناسبة للزائر.")} />
            <CheckRow checked={autoCurrency} onChange={setAutoCurrency} title={dt("عملة الزائر تلقائيًا")} hint={dt("اتركها مفعّلة ما لم تكن الحملة بعملة محددة.")} />
            <details className="rounded-lg border p-3 sm:col-span-2"><summary className="cursor-pointer text-sm font-semibold">{dt("خيارات إضافية للرابط")}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField label={dt("رمز الإحالة")} value={refCode} onValueChange={setRefCode} options={[{ value: "__none__", label: dt("بدون إحالة") }, ...referrals.map((r) => ({ value: r.code, label: r.name ? `${r.code} · ${r.name}` : r.code }))]} />
              <CheckRow checked={openCartPayment} onChange={setOpenCartPayment} title={dt("فتح حوار دفع السلة")} hint={dt("لروابط السلة المخصصة فقط.")} />
            </div></details>
          </section>

          {linkMode === "marketing" ? (
            <section className="space-y-4 border-t pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Label className="text-base font-semibold">{dt("٣ · مصدر الزيارة والحملة")}</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{dt("هذه البيانات تحفظ مع الرابط وتساعد صفحة أداء الروابط على مطابقة التبرعات.")}</p>
                </div>

              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label={dt("المنصة / القناة")} value={marketingForm.platform} onValueChange={(v) => updateMarketing({ platform: v as MarketingPlatform, autoPlatformData: false })} options={PLATFORM_OPTIONS.map((p) => ({ value: p.id, label: p.label }))} hint={selectedPlatform.hint} />
                <Field label={dynamicTemplate ? dt("اسم الرابط في السجل") : dt("اسم الحملة")} value={marketingForm.campaignName} onChange={(v) => updateMarketing({ campaignName: v })} placeholder={dt("مثال: إغاثة غزة · نوفمبر")} />
              </div>
              {["meta", "google_ads", "tiktok", "x"].includes(marketingForm.platform) ? <CheckRow checked={marketingForm.autoPlatformData} onChange={(checked) => updateMarketing({ autoPlatformData: checked })} title={dt("تعبئة بيانات الحملة من منصة الإعلان تلقائيًا")} hint={dt("للإعلانات فقط. سنجهّز رابط الصفحة ومعلمات التتبع في خانتين منفصلتين.")} /> : null}
              <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">{dt("معرّفات الإعلان وخيارات التتبع الإضافية")}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Campaign ID" value={dynamicTemplate ? effectiveMarketingForm.campaignId : marketingForm.campaignId} disabled={dynamicTemplate} onChange={(v) => updateMarketing({ campaignId: v })} placeholder={dt("اختياري لكن مهم للمطابقة")} dir="ltr" />
                <Field label="Ad Set / Ad Group ID" value={dynamicTemplate ? effectiveMarketingForm.adsetId : marketingForm.adsetId} disabled={dynamicTemplate} onChange={(v) => updateMarketing({ adsetId: v })} placeholder={dt("adset أو ad group")} dir="ltr" />
                <Field label="Ad ID" value={dynamicTemplate ? effectiveMarketingForm.adId : marketingForm.adId} disabled={dynamicTemplate} onChange={(v) => updateMarketing({ adId: v })} placeholder={dt("معرف الإعلان")} dir="ltr" />
                <Field label="Placement" value={dynamicTemplate ? effectiveMarketingForm.placement : marketingForm.placement} disabled={dynamicTemplate} onChange={(v) => updateMarketing({ placement: v })} placeholder="facebook_feed / instagram_reels" />
                <Field label="Target Country" value={marketingForm.targetCountry} onChange={(v) => updateMarketing({ targetCountry: v })} placeholder="TR / DE / US" dir="ltr" />
                <Field label="Audience Segment" value={marketingForm.audienceSegment} onChange={(v) => updateMarketing({ audienceSegment: v })} placeholder="donors_30d / lookalike" />
                <Field label="Message Variant" value={marketingForm.messageVariant} onChange={(v) => updateMarketing({ messageVariant: v })} placeholder="v1_image / v2_video" />
                <Field label="Objective" value={marketingForm.objective} onChange={(v) => updateMarketing({ objective: v })} placeholder="donations" />
                <Field label="Custom Content" value={marketingForm.customContent} onChange={(v) => updateMarketing({ customContent: v })} placeholder="ad name / creative" />
                {["email", "whatsapp", "sms"].includes(marketingForm.platform) ? <Field label="Messaging Campaign ID" value={marketingForm.messagingCampaignId} onChange={(v) => updateMarketing({ messagingCampaignId: v })} dir="ltr" /> : null}
                {["email", "whatsapp", "sms"].includes(marketingForm.platform) ? <Field label="Messaging Template ID" value={marketingForm.messagingTemplateId} onChange={(v) => updateMarketing({ messagingTemplateId: v })} dir="ltr" /> : null}
                <Field label="Button ID" value={marketingForm.buttonId} onChange={(v) => updateMarketing({ buttonId: v })} dir="ltr" />
                <Field label="Button Label" value={marketingForm.buttonLabel} onChange={(v) => updateMarketing({ buttonLabel: v })} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">{dt("ملاحظات داخلية")}</Label>
                <Textarea aria-label={dt("ملاحظات داخلية")} value={marketingForm.internalNotes} onChange={(event) => updateMarketing({ internalNotes: event.target.value })} placeholder={dt("سبب إنشاء الرابط، مالك الحملة، أو ملاحظة مراجعة قبل الإطلاق.")} className="min-h-24 resize-y" />
              </div>
              </details>
              {marketingIssues.filter(issue => issue.level === "warn").length ? <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm text-slate-600">{dt("ملاحظات اختيارية لتحسين التتبع")}</summary><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">{marketingIssues.filter(issue => issue.level === "warn").map(issue => <li key={issue.text}>{issue.text}</li>)}</ul></details> : null}
            </section>
          ) : null}

          </div>
          <section className="min-w-0 space-y-4 rounded-xl border bg-slate-50/70 p-4 lg:sticky lg:top-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><Label className="text-base font-semibold">{dt("الرابط الجاهز")}</Label><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{dynamicTemplate ? dt("قالب لإعداد الإعلان") : dt("رابط للمشاركة")}</span></div>
            {needsCampaignName ? <p role="status" className="text-sm text-amber-800">{dt("أدخل اسم الحملة أو معرّفها لإكمال الرابط.")}</p> : null}
            {unintendedMacros && !blockedMacros.length ? <p role="alert" className="text-sm text-amber-800">{dt("المتغيرات التلقائية مخصصة للإعلانات. فعّل التعبئة التلقائية أو استخدم قيمًا ثابتة.")}</p> : null}
            {blockedMacros.length ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{dt("احذف المتغيرات غير الصالحة قبل نسخ الرابط أو حفظه:")} <bdi dir="ltr">{blockedMacros.join(", ")}</bdi></p> : null}
            {dynamicTemplate ? <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
              <p className="text-sm leading-6 text-slate-600">{dt("ضع رابط الصفحة في خانة رابط الموقع داخل الإعلان، ومعلمات التتبع في خانة URL Parameters. هذه المتغيرات تُستبدل عند تشغيل الإعلان؛ لا تشارك القالب كرابط مباشر.")}</p>
              <CopyOutput label={dt("١ · رابط الموقع Website URL")} value={destinationUrl} disabled={!canUseLink} onCopy={() => copyText(destinationUrl)} />
              <CopyOutput label={dt("٢ · معلمات التتبع URL Parameters")} value={adParameters} disabled={!canUseLink} onCopy={() => copyText(adParameters)} />
            </div> : <CopyOutput label={dt("الرابط الكامل")} value={needsCampaignName ? "" : fullUrl} disabled={!canUseLink} onCopy={copyUrl} />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => saveRegistryLink(true)} disabled={!canUseLink || saving} className="min-h-11 gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{dynamicTemplate ? dt("حفظ ونسخ معلمات الإعلان") : dt("حفظ ونسخ الرابط")}</Button>
              <Button type="button" onClick={() => saveRegistryLink(false)} disabled={!canUseLink || saving} variant="outline" className="min-h-11 gap-2"><Save className="h-4 w-4" />{dt("حفظ فقط")}</Button>
              {fullUrl && canUseLink ? <Button asChild type="button" variant="ghost" className="min-h-11 gap-2"><a href={destinationUrl || fullUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{dt("معاينة الصفحة")}</a></Button> : null}
            </div>
            {lastSavedLink ? (
              <Alert className="border-emerald-200 bg-emerald-50">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>{lastSavedLink.updated ? dt("تم تحديث رابط موجود") : dt("تم حفظ الرابط في سجل الحملات")}</AlertTitle>
                <AlertDescription className="space-y-2">
                  <span className="block">
                    {lastSavedLink.name} · {lastSavedLink.mode === "marketing" ? dt("رابط حملة") : dt("رابط موقع")}{lastSavedLink.copied ? dt(" · تم نسخه أيضًا") : ""}
                  </span>
                  <a href="#links" className="inline-flex text-xs font-semibold text-emerald-800 underline-offset-4 hover:underline">
                    {dt("سجل الحملات")}
                  </a>
                </AlertDescription>
              </Alert>
            ) : null}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, dir, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; dir?: "rtl" | "ltr"; disabled?: boolean }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id} className="text-sm text-muted-foreground">{label}</Label><Input id={id} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("h-10", dir === "ltr" && "font-mono text-sm text-left")} dir={dir || dashDir()} /></div>;
}

function SelectField({ label, value, onValueChange, options, placeholder = dt("اختر"), disabled, hint }: { label: string; value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; hint?: string }) {
  const id = useId();
  return <div className="space-y-2"><Label htmlFor={id} className="text-sm text-muted-foreground">{label}</Label><Select value={value} onValueChange={onValueChange} disabled={disabled}><SelectTrigger id={id} className="h-10"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

function CheckRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (checked: boolean) => void; title: string; hint: string }) {
  return <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50"><Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" /><span className="text-sm leading-snug">{title}<span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span></span></label>;
}


function CopyOutput({ label, value, disabled, onCopy }: { label: string; value: string; disabled: boolean; onCopy: () => void }) {
  const id = useId();
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><div className="flex items-start gap-2"><Textarea id={id} readOnly dir="ltr" value={value} onFocus={event => event.target.select()} className="min-h-20 min-w-0 resize-y bg-white text-left font-mono text-xs leading-6" /><Button type="button" variant="outline" disabled={disabled} onClick={onCopy} aria-label={dt("نسخ {0}", [label])} className="min-h-11 shrink-0 gap-1"><Copy className="h-4 w-4" />{dt("نسخ")}</Button></div></div>;
}
