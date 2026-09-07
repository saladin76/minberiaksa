import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

type Recommendation = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  decision: "SCALE" | "HOLD" | "REDUCE" | "PAUSE" | "FIX_TRACKING" | "REVIEW";
  title: string;
  reason: string;
  action: string;
  href: string;
  metrics: JsonMap;
};

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function rowsFrom(data: unknown) { if (data && typeof data === "object" && Array.isArray((data as JsonMap).rows)) return (data as { rows: JsonMap[] }).rows; return []; }
function summaryFrom(data: unknown) { if (data && typeof data === "object" && typeof (data as JsonMap).summary === "object") return (data as JsonMap).summary as JsonMap; return {}; }
function nested(row: JsonMap, path: string) { return path.split(".").reduce<unknown>((acc, key) => { if (acc && typeof acc === "object" && key in acc) return (acc as JsonMap)[key]; return null; }, row); }

function dataQuality(row: JsonMap) {
  let score = 35;
  const warnings: string[] = [];
  const campaignId = text(row.campaignId);
  const adsetId = text(row.adsetId);
  const adId = text(row.adId);
  const spend = num(nested(row, "platformMetrics.spend"));
  const platformConversions = num(nested(row, "platformMetrics.conversions"));
  const platformRevenue = num(nested(row, "platformMetrics.revenue"));
  const siteDonations = num(nested(row, "siteMetrics.donations"));
  const siteRevenue = num(nested(row, "siteMetrics.revenue"));
  const strong = num(nested(row, "siteMetrics.matchQuality.strong"));
  const medium = num(nested(row, "siteMetrics.matchQuality.medium"));
  const weak = num(nested(row, "siteMetrics.matchQuality.weak"));
  const donationGap = Math.abs(num(nested(row, "gaps.donationGap")));

  if (campaignId) score += 15; else warnings.push("ناقص campaign_id");
  if (adsetId) score += 8;
  if (adId) score += 12; else warnings.push("ناقص ad_id");
  if (spend > 0) score += 10; else warnings.push("لا يوجد spend");
  if (platformConversions > 0 || platformRevenue > 0) score += 10;
  if (siteDonations > 0 || siteRevenue > 0) score += 10;
  if (strong > 0) score += 10; else if (medium > 0) score += 6; else if (weak > 0) score += 3;
  if (donationGap > 2) { score -= 12; warnings.push("فجوة تحويلات كبيرة بين الموقع والمنصة"); }
  if (spend > 0 && platformConversions > 0 && siteDonations === 0) { score -= 15; warnings.push("المنصة ترى تحويلات لا تظهر في الموقع"); }

  return { score: Math.max(0, Math.min(100, Math.round(score))), warnings, matchQuality: { strong, medium, weak } };
}

function baseMetrics(row: JsonMap) {
  return {
    spend: num(nested(row, "platformMetrics.spend")),
    platformConversions: num(nested(row, "platformMetrics.conversions")),
    siteDonations: num(nested(row, "siteMetrics.donations")),
    siteRevenue: num(nested(row, "siteMetrics.revenue")),
    siteRoas: num(nested(row, "siteMetrics.roas")),
    platformRoas: num(nested(row, "platformMetrics.roas")),
    donationGap: num(nested(row, "gaps.donationGap")),
    verdictLabel: text(nested(row, "verdict.label")),
    dataQuality: dataQuality(row),
  };
}

function recommendationFor(row: JsonMap): Recommendation {
  const platform = text(row.platform) || "منصة";
  const campaign = text(row.campaignName) || text(row.campaignId) || platform;
  const metrics = baseMetrics(row);
  const { spend, platformConversions, siteDonations, siteRevenue, siteRoas, platformRoas, donationGap } = metrics;
  const qualityScore = (metrics.dataQuality as { score: number }).score;

  if (platformRoas >= 2 && siteDonations === 0 && spend > 0) {
    return { id: `no-scale-gap-${text(row.id)}`, priority: "HIGH", decision: "FIX_TRACKING", title: `لا تزود قبل إصلاح الإسناد: ${campaign}`, reason: `المنصة تبدو جيدة ROAS ${platformRoas.toFixed(2)}x لكن الموقع لا يثبت تبرعات مطابقة.`, action: "لا تزود الميزانية الآن. راجع الرابط وCAPI وUTM ونافذة الإسناد حتى يتطابق الموقع مع المنصة.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (qualityScore < 55 && spend > 0) {
    return { id: `quality-low-${text(row.id)}`, priority: "HIGH", decision: "FIX_TRACKING", title: `جودة بيانات ضعيفة: ${campaign}`, reason: `Data Quality = ${qualityScore}/100، والقرار الإعلاني غير موثوق كفاية.`, action: "أكمل campaign_id/ad_id واستورد بيانات أدق قبل زيادة أو تخفيض كبير.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (spend > 0 && siteDonations === 0 && platformConversions === 0) {
    return { id: `pause-${text(row.id)}`, priority: "HIGH", decision: "PAUSE", title: `أوقف مؤقتًا: ${campaign}`, reason: `يوجد إنفاق ${spend} بدون تبرعات في الموقع أو تحويلات في المنصة.`, action: "أوقف الميزانية مؤقتًا أو خفّضها جدًا حتى تراجع الاستهداف والرسالة والرابط.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (siteRoas >= 2 && siteDonations >= 2 && Math.abs(donationGap) <= 1 && qualityScore >= 75) {
    return { id: `scale-${text(row.id)}`, priority: "HIGH", decision: "SCALE", title: `زود تدريجيًا: ${campaign}`, reason: `Site ROAS = ${siteRoas.toFixed(2)}x مع ${siteDonations} تبرعات وجودة بيانات ${qualityScore}/100.`, action: "زود الميزانية تدريجيًا 15% إلى 25% مع مراقبة التبرعات والإسناد خلال 24-48 ساعة.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (siteDonations > platformConversions + 1) {
    return { id: `fix-tracking-${text(row.id)}`, priority: "HIGH", decision: "FIX_TRACKING", title: `أصلح الإسناد: ${campaign}`, reason: `الموقع سجل ${siteDonations} تبرعات بينما المنصة سجلت ${platformConversions}.`, action: "لا تحكم على الحملة من المنصة فقط. راجع CAPI وdedup وUTM ونافذة الإسناد قبل قرار الميزانية.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (spend > 0 && siteRoas > 0 && siteRoas < 1) {
    return { id: `reduce-${text(row.id)}`, priority: "MEDIUM", decision: "REDUCE", title: `خفّض أو راجع: ${campaign}`, reason: `Site ROAS = ${siteRoas.toFixed(2)}x أقل من 1.`, action: "خفّض الميزانية وراجع الإعلان/الجمهور/صفحة الهبوط قبل أي توسعة.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  if (siteDonations >= 1 && siteRoas >= 1 && siteRoas < 2) {
    return { id: `hold-${text(row.id)}`, priority: "MEDIUM", decision: "HOLD", title: `ثبّت وراقب: ${campaign}`, reason: `الحملة جلبت تبرعات لكن العائد لم يصل لمستوى التوسعة بعد.`, action: "ثبت الميزانية وجرّب تحسين الرسالة أو الجمهور قبل الزيادة.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
  }
  return { id: `review-${text(row.id)}`, priority: "LOW", decision: "REVIEW", title: `راجع بعد بيانات أكثر: ${campaign}`, reason: "لا توجد إشارة كافية لاتخاذ قرار قوي الآن.", action: "انتظر بيانات أكثر أو راجع جودة الرابط والإسناد.", href: "/dashboard/marketing-intelligence/site-vs-platform", metrics };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = request.nextUrl.searchParams.get("days") || "7";
  const platform = request.nextUrl.searchParams.get("platform") || "ALL";
  const res = await fetch(`${request.nextUrl.origin}/api/admin/marketing-intelligence/site-vs-platform?platform=${encodeURIComponent(platform)}&days=${encodeURIComponent(days)}`, { headers: { cookie: request.headers.get("cookie") || "" }, cache: "no-store" });
  const comparison = await res.json().catch(() => null);
  const rows = rowsFrom(comparison);
  const recommendations = rows.map(recommendationFor);
  const weight = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  recommendations.sort((a, b) => weight[b.priority] - weight[a.priority]);
  const summary = summaryFrom(comparison);
  const qualityScores = recommendations.map((r) => num((r.metrics.dataQuality as JsonMap | undefined)?.score)).filter(Boolean);

  return NextResponse.json({
    ok: true,
    days: Number(days),
    platform,
    summary: {
      total: recommendations.length,
      scale: recommendations.filter((r) => r.decision === "SCALE").length,
      pause: recommendations.filter((r) => r.decision === "PAUSE").length,
      reduce: recommendations.filter((r) => r.decision === "REDUCE").length,
      fixTracking: recommendations.filter((r) => r.decision === "FIX_TRACKING").length,
      spend: num(summary.spend),
      siteRevenue: num(summary.siteRevenue),
      siteRoas: num(summary.siteRoas),
      avgDataQuality: qualityScores.length ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) : 0,
    },
    recommendations,
  }, { headers: { "Cache-Control": "no-store" } });
}
