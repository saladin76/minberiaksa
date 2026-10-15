import {
  brandAssets,
  brandColors,
  brandFonts,
  brandGuidelines,
  brandMessageFrameworks,
  brandProfiles,
} from "./brand-data";
import { getBrandRepositorySnapshot, type BrandRepositorySnapshot } from "./brand-repository";
import type {
  BrandAiSourcePack,
  BrandAsset,
  BrandCenterSnapshot,
  BrandCenterTab,
  BrandDownloadItem,
  BrandProfile,
  BrandReadinessAlert,
} from "./brand-types";
import { dt } from "@/lib/dashboard/i18n";

// Team-facing brand guide tabs (Arabic). "المؤسسات" (organizations) is intentionally NOT listed  it
// was removed from the user-facing Brand Center; the /dashboard/brand/organizations route redirects.
export const BRAND_CENTER_TABS: BrandCenterTab[] = [
  { key: "overview", get title() { return dt("دليل الهوية"); }, href: "/dashboard/brand" },
  { key: "assets", get title() { return dt("الأصول والشعارات"); }, href: "/dashboard/brand/assets" },
  { key: "colors", get title() { return dt("الألوان"); }, href: "/dashboard/brand/colors" },
  { key: "typography", get title() { return dt("الخطوط"); }, href: "/dashboard/brand/typography" },
  { key: "voice", get title() { return dt("نبرة الخطاب"); }, href: "/dashboard/brand/voice" },
  { key: "frameworks", get title() { return dt("قوالب الرسائل"); }, href: "/dashboard/brand/frameworks" },
  { key: "downloads", get title() { return dt("التنزيلات"); }, href: "/dashboard/brand/downloads" },
];

const nextModels = [
  "BrandProfile",
  "BrandAsset",
  "BrandColor",
  "BrandFont",
  "BrandGuideline",
  "BrandMessageFramework",
];

function activeProfile(profiles: BrandProfile[], profileId?: string | null): BrandProfile {
  return profiles.find((profile) => profile.id === profileId) ?? profiles.find((profile) => profile.isActive) ?? profiles[0];
}

function scoped<T extends { profileId: string }>(items: T[], profileId: string) {
  return items.filter((item) => item.profileId === profileId);
}

function buildDownloads(profile: BrandProfile, assets: BrandAsset[]): BrandDownloadItem[] {
  const profileAssets = scoped(assets, profile.id);
  return [
    {
      id: `${profile.id}_profile_download`,
      title: dt("{0}  ملف الهوية", [profile.name]),
      type: "PROFILE",
      url: null,
      note: dt("ملخص الهوية جاهز؛ يُنشأ ملف التصدير/التحميل بعد اعتماد بيانات الهوية."),
      ready: false,
    },
    ...profileAssets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      type: asset.type,
      url: asset.fileUrl,
      note: asset.notes,
      ready: Boolean(asset.fileUrl && asset.downloadable),
    })),
  ];
}

function buildAlerts(repository: BrandRepositorySnapshot, profile: BrandProfile): BrandReadinessAlert[] {
  const profileAssets = scoped(repository.assets, profile.id);
  const profileColors = scoped(repository.colors, profile.id);
  const profileFrameworks = scoped(repository.messageFrameworks, profile.id);
  // Team-facing readiness notes  Arabic only. These are actionable brand-setup reminders; the UI
  // shows them under a collapsible "تنبيهات متقدمة" so they are never the first thing on the page.
  const alerts: BrandReadinessAlert[] = [];

  if (!profileAssets.some((asset) => asset.type === "LOGO" && asset.fileUrl)) {
    alerts.push({
      id: `${profile.id}_missing_logo`,
      severity: "warning",
      title: dt("الشعار الأساسي يحتاج اعتماد"),
      detail: dt("ارفع أو اربط ملف الشعار المعتمد قبل تفعيل التنزيلات العامة."),
    });
  }

  if (!profileColors.some((color) => color.usage === "CTA")) {
    alerts.push({
      id: `${profile.id}_missing_cta_color`,
      severity: "warning",
      title: dt("لون زر التبرع غير محدد"),
      detail: dt("حدّد لونًا واضحًا لزر التبرع في الصفحات الموجّهة للمتبرعين."),
    });
  }

  if (!profileFrameworks.some((framework) => framework.type === "ZAKAT")) {
    alerts.push({
      id: `${profile.id}_missing_zakat_framework`,
      severity: "info",
      title: dt("إطار الزكاة غير مكتمل"),
      detail: dt("أضف قالب رسائل للزكاة قبل كتابة أو مراجعة محتوى الزكاة."),
    });
  }

  if (!profileFrameworks.some((framework) => framework.locale === "tr")) {
    alerts.push({
      id: `${profile.id}_missing_tr_rules`,
      severity: "info",
      title: dt("قواعد الكتابة التركية تحتاج توسّعًا"),
      detail: dt("أضف أمثلة نبرة تركية قبل الترجمة أو إرسال رسائل إعادة التفعيل."),
    });
  }

  return alerts;
}

function activeModels(repository: BrandRepositorySnapshot): string[] {
  if (repository.mode !== "db-backed") return [];
  return [
    "BrandProfile",
    ...(repository.dbCounts.assets > 0 ? ["BrandAsset"] : []),
    "BrandColor",
    ...(repository.dbCounts.fonts > 0 ? ["BrandFont"] : []),
    "BrandGuideline",
    ...(repository.dbCounts.messageFrameworks > 0 ? ["BrandMessageFramework"] : []),
  ];
}

function buildBrandCenterSnapshot(repository: BrandRepositorySnapshot, profileId?: string | null): BrandCenterSnapshot {
  const profile = activeProfile(repository.profiles, profileId);
  const assets = scoped(repository.assets, profile.id);
  const colors = scoped(repository.colors, profile.id).sort((a, b) => a.order - b.order);
  const fonts = scoped(repository.fonts, profile.id);
  const guidelines = scoped(repository.guidelines, profile.id).sort((a, b) => a.order - b.order);
  const messageFrameworks = scoped(repository.messageFrameworks, profile.id);
  const downloads = buildDownloads(profile, repository.assets);
  const alerts = buildAlerts(repository, profile);
  const toVerify = [...repository.profiles, ...repository.assets].filter((item) => item.status === "TO_VERIFY").length;

  return {
    source: repository.mode === "db-backed" ? "brand-center-db-backed" : "brand-center-foundation",
    persistence: {
      mode: repository.mode,
      nextModels,
      activeModels: activeModels(repository),
      reason: repository.reason,
      dbCounts: repository.dbCounts,
    },
    generatedAt: new Date().toISOString(),
    activeProfile: profile,
    profiles: repository.profiles,
    assets,
    colors,
    fonts,
    guidelines,
    messageFrameworks,
    downloads,
    alerts,
    tabs: BRAND_CENTER_TABS,
    summary: {
      profiles: repository.profiles.length,
      activeProfileName: profile.name,
      assets: assets.length,
      downloadableAssets: downloads.filter((item) => item.ready).length,
      colors: colors.length,
      guidelines: guidelines.length,
      frameworks: messageFrameworks.length,
      toVerify,
    },
    qa: {
      brandAssetSeparatedFromArchiveAsset: true,
      aiOutputsAreDraftOnly: true,
      noAutoPublish: true,
      noFrontendSecrets: true,
    },
  };
}

function getFoundationRepositorySnapshot(): BrandRepositorySnapshot {
  return {
    mode: "foundation-fallback",
    source: "foundation",
    reason: "Using foundation brand data for synchronous compatibility.",
    profiles: brandProfiles,
    assets: brandAssets,
    colors: brandColors,
    fonts: brandFonts,
    guidelines: brandGuidelines,
    messageFrameworks: brandMessageFrameworks,
    dbCounts: {
      profiles: 0,
      assets: 0,
      colors: 0,
      fonts: 0,
      guidelines: 0,
      messageFrameworks: 0,
    },
  };
}

export async function getBrandCenterSnapshot(profileId?: string | null): Promise<BrandCenterSnapshot> {
  return buildBrandCenterSnapshot(await getBrandRepositorySnapshot(), profileId);
}

export function getBrandCenterOverview() {
  return getBrandCenterFoundationSnapshot();
}

export async function getBrandCenterOverviewDbBacked() {
  return getBrandCenterSnapshot();
}

export function getBrandCenterFoundationSnapshot(profileId?: string | null): BrandCenterSnapshot {
  return buildBrandCenterSnapshot(getFoundationRepositorySnapshot(), profileId);
}

export function getBrandAiSourcePack(profileId?: string | null): BrandAiSourcePack {
  const snapshot = getBrandCenterFoundationSnapshot(profileId);
  return {
    profile: snapshot.activeProfile,
    colors: snapshot.colors,
    guidelines: snapshot.guidelines,
    frameworks: snapshot.messageFrameworks,
  };
}

export async function getBrandAiSourcePackDbBacked(profileId?: string | null): Promise<BrandAiSourcePack> {
  const snapshot = await getBrandCenterSnapshot(profileId);
  return {
    profile: snapshot.activeProfile,
    colors: snapshot.colors,
    guidelines: snapshot.guidelines,
    frameworks: snapshot.messageFrameworks,
  };
}
