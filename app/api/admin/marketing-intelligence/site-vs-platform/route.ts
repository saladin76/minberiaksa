import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

type MetricRow = {
  platform?: string;
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  revenue?: number;
  currency?: string;
};

type SiteAgg = {
  donations: number;
  revenue: number;
  strong: number;
  medium: number;
  weak: number;
};

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(value: unknown) {
  return readString(value)?.trim().toLowerCase() || null;
}

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function platformMetrics(days: number, platform?: string | null): Promise<MetricRow[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days + 1);
  const filter: JsonMap = { date: { $gte: dateKey(from), $lte: dateKey(to) } };
  if (platform && platform !== "ALL") filter.platform = platform.toUpperCase();
  const result = await prisma.$runCommandRaw({
    find: "MarketingPlatformDailyMetric",
    filter,
    sort: { date: -1, spend: -1 },
    limit: 1000,
  }) as JsonMap;
  const rows = isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return rows as MetricRow[];
}

function attrString(attribution: unknown, key: string): string | null {
  if (!isMap(attribution)) return null;
  return readString(attribution[key]);
}

function scoreDonationAgainstMetric(metric: MetricRow, attribution: unknown) {
  let score = 0;
  const reasons: string[] = [];

  const platform = normalize(metric.platform);
  const source = normalize(attrString(attribution, "utm_source") || attrString(attribution, "channel"));
  if (platform && source && (source.includes(platform) || platform.includes(source))) {
    score += 1;
    reasons.push("platform");
  }

  const campaignId = normalize(metric.campaignId);
  const donationCampaignId = normalize(attrString(attribution, "campaign_id") || attrString(attribution, "utm_id"));
  if (campaignId && donationCampaignId && campaignId === donationCampaignId) {
    score += 5;
    reasons.push("campaign_id");
  }

  const adId = normalize(metric.adId);
  const donationAdId = normalize(attrString(attribution, "ad_id"));
  if (adId && donationAdId && adId === donationAdId) {
    score += 6;
    reasons.push("ad_id");
  }

  const adsetId = normalize(metric.adsetId);
  const donationAdsetId = normalize(attrString(attribution, "adset_id") || attrString(attribution, "ad_group_id"));
  if (adsetId && donationAdsetId && adsetId === donationAdsetId) {
    score += 4;
    reasons.push("adset_id");
  }

  return { score, reasons };
}

function quality(score: number) {
  if (score >= 7) return "strong";
  if (score >= 4) return "medium";
  if (score >= 2) return "weak";
  return "none";
}

function verdict(args: { platformConversions: number; siteDonations: number; platformRevenue: number; siteRevenue: number; spend: number }) {
  const { platformConversions, siteDonations, platformRevenue, siteRevenue, spend } = args;
  if (spend > 0 && siteDonations === 0 && platformConversions === 0) return { tone: "danger", label: "إنفاق بدون تبرعات", action: "راجع الحملة أو أوقفها مؤقتًا حتى يظهر أثر واضح في الموقع أو المنصة." };
  if (siteDonations > platformConversions + 1) return { tone: "warning", label: "الموقع أعلى من المنصة", action: "المنصة لا ترى كل التبرعات. راجع CAPI / dedup / attribution window." };
  if (platformConversions > siteDonations + 1) return { tone: "warning", label: "المنصة أعلى من الموقع", action: "راجع تعريف التحويل في المنصة واحتمال احتساب أحداث غير مدفوعة أو مكررة." };
  if (siteRevenue > platformRevenue * 1.25 && platformRevenue > 0) return { tone: "warning", label: "إيراد الموقع أعلى", action: "راجع قيمة التحويل في المنصة خصوصًا دعم الفريق والرسوم." };
  if (spend > 0 && siteRevenue / spend >= 2) return { tone: "good", label: "أداء جيد", action: "يمكن زيادة الميزانية تدريجيًا مع مراقبة جودة الإسناد." };
  if (spend > 0 && siteRevenue / spend < 1) return { tone: "danger", label: "ROAS منخفض", action: "راجع الاستهداف والرسالة والرابط قبل زيادة الميزانية." };
  return { tone: "neutral", label: "متوازن", action: "استمر في المراقبة حتى تتجمع بيانات أكثر." };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = numberParam(request, "days", 7, 1, 90);
  const platform = readString(request.nextUrl.searchParams.get("platform"))?.toUpperCase() || "ALL";
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const [metrics, donations] = await Promise.all([
    platformMetrics(days, platform),
    prisma.donation.findMany({
      where: { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER },
      select: { id: true, amount: true, amountUSD: true, totalAmount: true, currency: true, createdAt: true, attribution: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const rows = metrics.map((metric, index) => {
    const site: SiteAgg = { donations: 0, revenue: 0, strong: 0, medium: 0, weak: 0 };
    for (const donation of donations) {
      const match = scoreDonationAgainstMetric(metric, donation.attribution);
      if (match.score < 2) continue;
      site.donations += 1;
      site.revenue += donationRowUsdApprox(donation);
      const q = quality(match.score);
      if (q === "strong") site.strong += 1;
      else if (q === "medium") site.medium += 1;
      else site.weak += 1;
    }

    const spend = readNumber(metric.spend);
    const platformRevenue = readNumber(metric.revenue);
    const platformConversions = readNumber(metric.conversions);
    const platformRoas = spend > 0 ? platformRevenue / spend : 0;
    const siteRoas = spend > 0 ? site.revenue / spend : 0;
    const donationGap = site.donations - platformConversions;
    const revenueGap = site.revenue - platformRevenue;

    return {
      id: `${metric.platform || "UNKNOWN"}:${metric.campaignId || metric.adsetId || metric.adId || index}`,
      platform: metric.platform || "UNKNOWN",
      campaignId: metric.campaignId || null,
      campaignName: metric.campaignName || null,
      adsetId: metric.adsetId || null,
      adId: metric.adId || null,
      currency: metric.currency || "USD",
      platformMetrics: {
        spend,
        impressions: readNumber(metric.impressions),
        clicks: readNumber(metric.clicks),
        conversions: platformConversions,
        revenue: platformRevenue,
        roas: platformRoas,
      },
      siteMetrics: {
        donations: site.donations,
        revenue: site.revenue,
        roas: siteRoas,
        matchQuality: { strong: site.strong, medium: site.medium, weak: site.weak },
      },
      gaps: {
        donationGap,
        revenueGap,
        roasGap: siteRoas - platformRoas,
      },
      verdict: verdict({ platformConversions, siteDonations: site.donations, platformRevenue, siteRevenue: site.revenue, spend }),
    };
  }).sort((a, b) => b.platformMetrics.spend - a.platformMetrics.spend);

  const summary = rows.reduce((acc, row) => {
    acc.spend += row.platformMetrics.spend;
    acc.platformConversions += row.platformMetrics.conversions;
    acc.platformRevenue += row.platformMetrics.revenue;
    acc.siteDonations += row.siteMetrics.donations;
    acc.siteRevenue += row.siteMetrics.revenue;
    return acc;
  }, { spend: 0, platformConversions: 0, platformRevenue: 0, siteDonations: 0, siteRevenue: 0 });

  return NextResponse.json({
    ok: true,
    range: { from: dateKey(from), to: dateKey(to), days },
    platform,
    summary: {
      ...summary,
      platformRoas: summary.spend > 0 ? summary.platformRevenue / summary.spend : 0,
      siteRoas: summary.spend > 0 ? summary.siteRevenue / summary.spend : 0,
      donationGap: summary.siteDonations - summary.platformConversions,
      revenueGap: summary.siteRevenue - summary.platformRevenue,
    },
    rows,
  }, { headers: { "Cache-Control": "no-store" } });
}
