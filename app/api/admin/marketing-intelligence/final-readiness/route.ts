import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";
import { safeCountValue } from "@/lib/dashboard/safe-count";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;
type CheckStatus = "PASS" | "WARN" | "FAIL";

type Check = {
  id: string;
  title: string;
  status: CheckStatus;
  description: string;
  action: string;
  href: string;
  value?: number | string;
};

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function collectionCount(collection: string, filter: JsonMap = {}) {
  const result = await prisma.$runCommandRaw({ count: collection, query: filter }).catch(() => null) as JsonMap | null;
  return num(result?.n);
}

async function latestRows(collection: string, limit = 5) {
  const result = await prisma.$runCommandRaw({ find: collection, filter: {}, sort: { createdAt: -1, updatedAt: -1 }, limit }).catch(() => null) as JsonMap | null;
  if (!isMap(result?.cursor) || !Array.isArray(result.cursor.firstBatch)) return [];
  return result.cursor.firstBatch.filter(isMap);
}

async function trackingSettings() {
  const result = await prisma.$runCommandRaw({ find: "TrackingSettings", limit: 1, sort: { createdAt: 1 } }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return isMap(rows[0]) ? rows[0] : null;
}

function has(settings: JsonMap | null, key: string) {
  const value = settings?.[key];
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    platformMetricCount,
    budgetDecisionCount,
    conversionEventCount,
    failedConversionCount,
    paidDonationCount,
    settings,
    platformRows,
  ] = await Promise.all([
    collectionCount("MarketingPlatformDailyMetric"),
    collectionCount("MarketingBudgetDecisionLog"),
    collectionCount("ConversionEvent"),
    collectionCount("ConversionEvent", { status: "FAILED" }),
    safeCountValue("finalReadiness.paidDonations", () => prisma.donation.count({ where: { createdAt: { gte: since }, ...PAID_DONATION_FILTER } })),
    trackingSettings(),
    latestRows("MarketingPlatformDailyMetric", 3),
  ]);

  const metaReady = has(settings, "facebookPixelId") || has(settings, "facebookAccessToken");
  const gaReady = has(settings, "gaMeasurementId") || has(settings, "gaApiSecret");
  const googleReady = has(settings, "googleAdsConversionId") || has(settings, "googleAdsConversionLabel");
  const anyTrackingReady = metaReady || gaReady || googleReady || has(settings, "tiktokPixelId") || has(settings, "xPixelId");

  const checks: Check[] = [
    {
      id: "routes-structure",
      title: "هيكلة القسم جاهزة",
      status: "PASS",
      description: "القسم منظم في لوحة التشغيل، جاهزية الإطلاق، البيانات، التدقيق، القرارات، وخريطة النظام.",
      action: "افتح مركز التسويق وتأكد من وضوح المسارات للفريق.",
      href: "/dashboard/marketing-intelligence",
    },
    {
      id: "tracking-settings",
      title: "إعدادات التتبع",
      status: anyTrackingReady ? "PASS" : "WARN",
      description: anyTrackingReady ? "يوجد إعداد واحد على الأقل لمنصة تتبع أو إعلان." : "لم يتم العثور على إعدادات تتبع واضحة. قد تكون المنصات غير مفعلة بعد.",
      action: "راجع حالة المنصات وإعدادات التتبع قبل إطلاق حملة كبيرة.",
      href: "/dashboard/marketing-intelligence/platform-status",
    },
    {
      id: "platform-metrics",
      title: "بيانات المنصات",
      status: platformMetricCount > 0 ? "PASS" : "WARN",
      description: platformMetricCount > 0 ? `يوجد ${platformMetricCount} سجل بيانات منصة جاهز للتحليل.` : "لا توجد بيانات منصات بعد. المقارنة والتوصيات ستبقى محدودة حتى استيراد CSV.",
      action: "استورد تقرير CSV حقيقي من Meta أو Google Ads أو TikTok أو GA4.",
      href: "/dashboard/marketing-intelligence/platform-metrics/import",
      value: platformMetricCount,
    },
    {
      id: "conversion-events",
      title: "سجل التحويلات",
      status: failedConversionCount > 0 ? "WARN" : "PASS",
      description: failedConversionCount > 0 ? `يوجد ${failedConversionCount} تحويل فاشل يحتاج مراجعة.` : `سجل التحويلات لا يظهر فشلًا حاليًا ضمن الفحص العام. إجمالي الأحداث: ${conversionEventCount}.`,
      action: failedConversionCount > 0 ? "افتح سجل التحويلات أو مركز الإصلاح." : "استمر بالمراقبة بعد أول تبرع من إعلان.",
      href: "/dashboard/conversion-events",
      value: failedConversionCount,
    },
    {
      id: "paid-donations",
      title: "تبرعات مدفوعة آخر 7 أيام",
      status: paidDonationCount > 0 ? "PASS" : "WARN",
      description: paidDonationCount > 0 ? `يوجد ${paidDonationCount} تبرع مدفوع خلال آخر 7 أيام.` : "لا توجد تبرعات مدفوعة حديثة للمقارنة. انتظر أول تبرع من إعلان للاختبار الحقيقي.",
      action: "بعد أول تبرع من إعلان، راجع تدقيق قيمة التحويلات والمقارنة.",
      href: "/dashboard/marketing-intelligence/conversion-value-audit",
      value: paidDonationCount,
    },
    {
      id: "budget-decisions",
      title: "سجل قرارات الميزانية",
      status: budgetDecisionCount > 0 ? "PASS" : "WARN",
      description: budgetDecisionCount > 0 ? `تم تسجيل ${budgetDecisionCount} قرار ميزانية.` : "لم يتم تسجيل قرارات ميزانية بعد. سيبدأ السجل بعد ضغط الفريق على تم التنفيذ داخل توصيات الميزانية.",
      action: "بعد ظهور توصيات، سجل القرارات المنفذة لمراجعة أثرها لاحقًا.",
      href: "/dashboard/marketing-intelligence/budget-decisions",
      value: budgetDecisionCount,
    },
    {
      id: "launch-checklist",
      title: "جاهزية الإطلاق",
      status: platformMetricCount > 0 && anyTrackingReady ? "PASS" : "WARN",
      description: platformMetricCount > 0 && anyTrackingReady ? "النظام جاهز مبدئيًا لمراجعة إطلاق حملة عبر Checklist." : "قبل التوسعة الكبيرة، أكمل بيانات المنصات وإعدادات التتبع.",
      action: "استخدم صفحة جاهزية الإطلاق كآخر خطوة قبل تشغيل أو توسيع حملة.",
      href: "/dashboard/marketing-intelligence/launch-readiness",
    },
  ];

  const failed = checks.filter((check) => check.status === "FAIL").length;
  const warning = checks.filter((check) => check.status === "WARN").length;
  const passed = checks.filter((check) => check.status === "PASS").length;
  const score = Math.round((passed / checks.length) * 100);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    score,
    summary: { total: checks.length, passed, warning, failed },
    checks,
    latestPlatformRows: platformRows,
  }, { headers: { "Cache-Control": "no-store" } });
}
