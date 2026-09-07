import { prisma } from "@/lib/prisma";
import { fetchAdsDonations } from "@/lib/admin/ads-fetch";
import { aggregateBreakdown } from "@/lib/attribution/aggregate";
import type {
  MarketingResultItem,
  MarketingResultChannel,
  MarketingResultStatus,
  MarketingResultsOverview,
} from "./results-types";

/**
 * Real marketing results — per campaign, from live data:
 *   - site donations + first-party revenue come from donation attribution
 *     (`aggregateBreakdown(..., "campaign")`, the same engine the ads dashboard uses),
 *   - spend + clicks come from the ad-platform snapshots (`AdCampaignSnapshot`).
 * ROAS is first-party revenue ÷ spend. Nothing here is hardcoded; when there is no
 * ad data and no attributed donations, the result set is empty.
 */

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function mapChannel(platform: string | null | undefined): MarketingResultChannel {
  const p = (platform ?? "").toUpperCase();
  if (p.includes("META") || p.includes("FACEBOOK") || p.includes("INSTAGRAM")) return "META";
  if (p.includes("GOOGLE")) return "GOOGLE";
  if (p.includes("TIKTOK")) return "TIKTOK";
  if (p.includes("WHATSAPP")) return "WHATSAPP";
  if (p.includes("EMAIL")) return "EMAIL";
  return "ORGANIC";
}

function deriveStatus(spend: number, revenue: number, donations: number, clicks: number): MarketingResultStatus {
  const roas = spend > 0 ? revenue / spend : 0;
  if (spend > 0 && roas >= 4) return "WINNER";
  if (spend > 0 && donations === 0 && clicks > 0) return "LOSING";
  if (spend > 0 && roas > 0 && roas < 1) return "LOSING";
  if (spend > 0) return "LEARNING";
  if (donations > 0) return "WATCH"; // organic / no-spend but converting
  return "WATCH";
}

function deriveDecision(status: MarketingResultStatus): string {
  switch (status) {
    case "WINNER":
      return "أداء قوي: كرّر الفكرة بنسخة أقصر ولغة أخرى، وزد الميزانية تدريجيًا.";
    case "LEARNING":
      return "نتائج متوسطة: اختبر الرسالة أو الصورة قبل التوسّع في الإنفاق.";
    case "LOSING":
      return "أوقف أو أعد الصياغة قبل إعادة الإنفاق على نفس المادة.";
    case "WATCH":
    default:
      return "قناة بلا إنفاق ظاهر: راجع دقة التتبع قبل الحكم على النتيجة.";
  }
}

function deriveLearning(spend: number, revenue: number, donations: number, clicks: number): string {
  if (spend > 0 && clicks > 0 && donations === 0) {
    return `${clicks.toLocaleString()} نقرة بلا تبرعات — الفجوة غالبًا في صفحة التبرع أو الرسالة.`;
  }
  if (spend > 0 && revenue / spend >= 4) {
    return "تحويل بكفاءة عالية مقابل الإنفاق — مادة قابلة للتوسّع.";
  }
  if (spend === 0 && donations > 0) {
    return `${donations.toLocaleString()} تبرع بدون إنفاق إعلاني — قناة مجانية فعّالة تستحق قالبًا متكررًا.`;
  }
  if (spend > 0 && donations > 0) {
    return `${donations.toLocaleString()} تبرع من ${clicks.toLocaleString()} نقرة — راقب تكلفة التبرع مقابل العائد.`;
  }
  return "لا توجد إشارة كافية بعد لاستخلاص تعلّم موثوق.";
}

function buildItem(input: {
  id: string;
  title: string;
  platform: string | null | undefined;
  spend: number;
  clicks: number;
  revenue: number;
  donations: number;
}): MarketingResultItem {
  const { id, title, platform, spend, clicks, revenue, donations } = input;
  const status = deriveStatus(spend, revenue, donations, clicks);
  const roas = spend > 0 ? roundToTwo(revenue / spend) : 0;
  return {
    id,
    archiveAssetId: "",
    assetTitle: title,
    channel: mapChannel(platform),
    campaignTitle: title,
    spend: roundToTwo(spend),
    revenue: roundToTwo(revenue),
    donations,
    clicks,
    roas,
    status,
    decision: deriveDecision(status),
    learning: deriveLearning(spend, revenue, donations, clicks),
  };
}

const MAX_RESULTS = 50;

export async function getMarketingResultsOverview(): Promise<MarketingResultsOverview> {
  const { donations, range } = await fetchAdsDonations({
    period: "month",
    startParam: null,
    endParam: null,
    categoryId: null,
    campaignId: null,
    country: null,
  });

  // First-party per-campaign performance (site donations + revenue).
  const campaignRows = aggregateBreakdown(donations, "campaign").filter((r) => r.key !== "__unset");

  // Ad spend + clicks per campaign for the same window.
  const snapshots = await prisma.adCampaignSnapshot
    .findMany({
      where: { date: { gte: range.startDate, lte: range.endDate } },
      select: { campaignId: true, campaignName: true, platform: true, spend: true, clicks: true },
    })
    .catch(() => []);

  const spendByCampaign = new Map<string, { spend: number; clicks: number; name: string | null; platform: string }>();
  for (const s of snapshots) {
    const prev = spendByCampaign.get(s.campaignId) ?? { spend: 0, clicks: 0, name: s.campaignName, platform: s.platform };
    prev.spend += s.spend ?? 0;
    prev.clicks += s.clicks ?? 0;
    prev.name = prev.name ?? s.campaignName;
    spendByCampaign.set(s.campaignId, prev);
  }

  const items: MarketingResultItem[] = [];
  const seenCampaignIds = new Set<string>();

  for (const row of campaignRows) {
    const spendInfo = row.id ? spendByCampaign.get(row.id) : undefined;
    if (row.id) seenCampaignIds.add(row.id);
    items.push(
      buildItem({
        id: row.id ?? row.key,
        title: row.label,
        platform: row.platform ?? spendInfo?.platform ?? null,
        spend: spendInfo?.spend ?? 0,
        clicks: spendInfo?.clicks ?? 0,
        revenue: row.revenueUSD,
        donations: row.paidCount,
      })
    );
  }

  // Campaigns that spent but produced no attributed donations (pure cost / awareness).
  for (const [campaignId, info] of spendByCampaign) {
    if (seenCampaignIds.has(campaignId)) continue;
    items.push(
      buildItem({
        id: campaignId,
        title: info.name ?? campaignId,
        platform: info.platform,
        spend: info.spend,
        clicks: info.clicks,
        revenue: 0,
        donations: 0,
      })
    );
  }

  items.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);
  const results = items.slice(0, MAX_RESULTS);

  const totalSpend = results.reduce((sum, item) => sum + item.spend, 0);
  const totalRevenue = results.reduce((sum, item) => sum + item.revenue, 0);
  const totalDonations = results.reduce((sum, item) => sum + item.donations, 0);
  const paidItems = results.filter((item) => item.spend > 0);
  const averageRoas = paidItems.length ? paidItems.reduce((sum, item) => sum + item.roas, 0) / paidItems.length : 0;

  return {
    source: "live",
    generatedAt: new Date().toISOString(),
    summary: {
      totalResults: results.length,
      totalSpend: roundToTwo(totalSpend),
      totalRevenue: roundToTwo(totalRevenue),
      totalDonations,
      averageRoas: roundToTwo(averageRoas),
      winners: results.filter((item) => item.status === "WINNER").length,
      losing: results.filter((item) => item.status === "LOSING").length,
    },
    results,
  };
}
