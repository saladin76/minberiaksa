import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";
import { prisma } from "@/lib/prisma";
import {
  listCampaignLinks,
  readString,
  type CampaignLinkRecord,
  type CampaignLinkStatus,
  type CampaignLinkStatusFilter,
  type JsonMap,
} from "./campaign-link-registry-service";

type RecommendationTone = "good" | "warning" | "danger" | "neutral";
type ActionPriority = "HIGH" | "MEDIUM" | "LOW";

type ConversionEventLike = {
  donationId?: string;
  platform?: string;
  channel?: string;
  eventName?: string;
  status?: string;
};

type CampaignAction = {
  id: string;
  priority: ActionPriority;
  title: string;
  description: string;
  action: string;
};

export type CampaignLinkPerformanceQuery = {
  days: number;
  limit: number;
  platform?: string | null;
  status: CampaignLinkStatusFilter;
  id?: string | null;
};

function rawCommand(command: unknown) {
  return command as Parameters<typeof prisma.$runCommandRaw>[0];
}

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attrString(attribution: unknown, key: string): string | null {
  return isMap(attribution) ? readString(attribution[key]) : null;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function linkStatus(link: CampaignLinkRecord): CampaignLinkStatus {
  const status = typeof link.status === "string" ? link.status.toUpperCase() : "ACTIVE";
  if (status === "ARCHIVED" || status === "DELETED") return status;
  return "ACTIVE";
}

function hasClickId(attribution: unknown) {
  return Boolean(
    attrString(attribution, "fbclid") ||
    attrString(attribution, "fbc") ||
    attrString(attribution, "fbp") ||
    attrString(attribution, "gclid") ||
    attrString(attribution, "gbraid") ||
    attrString(attribution, "wbraid") ||
    attrString(attribution, "ttclid") ||
    attrString(attribution, "twclid")
  );
}

function scoreMatch(link: CampaignLinkRecord, attribution: unknown) {
  let score = 0;
  const reasons: string[] = [];
  const platform = normalize(link.platform);
  const source = normalize(attrString(attribution, "utm_source") || attrString(attribution, "channel"));
  if (platform && source && (source.includes(platform) || platform.includes(source))) {
    score += 1;
    reasons.push("platform");
  }

  const campaignId = normalize(link.campaignId || link.utmId);
  const donationCampaignId = normalize(attrString(attribution, "campaign_id") || attrString(attribution, "utm_id"));
  if (campaignId && donationCampaignId && campaignId === donationCampaignId) {
    score += 5;
    reasons.push("campaign_id");
  }

  const adId = normalize(link.adId);
  const donationAdId = normalize(attrString(attribution, "ad_id"));
  if (adId && donationAdId && adId === donationAdId) {
    score += 6;
    reasons.push("ad_id");
  }

  const adsetId = normalize(link.adsetId || link.adGroupId);
  const donationAdsetId = normalize(attrString(attribution, "adset_id") || attrString(attribution, "ad_group_id"));
  if (adsetId && donationAdsetId && adsetId === donationAdsetId) {
    score += 4;
    reasons.push("adset_id");
  }

  const utmCampaign = normalize(link.utmCampaign);
  const donationUtmCampaign = normalize(attrString(attribution, "utm_campaign") || attrString(attribution, "campaign_name"));
  if (utmCampaign && donationUtmCampaign && utmCampaign === donationUtmCampaign) {
    score += 3;
    reasons.push("utm_campaign");
  }

  const utmContent = normalize(link.utmContent);
  const donationUtmContent = normalize(attrString(attribution, "utm_content") || attrString(attribution, "ad_name"));
  if (utmContent && donationUtmContent && utmContent === donationUtmContent) {
    score += 2;
    reasons.push("utm_content");
  }

  const targetCountry = normalize(link.targetCountry);
  const donationCountry = normalize(attrString(attribution, "target_country") || attrString(attribution, "ad_country"));
  if (targetCountry && donationCountry && targetCountry === donationCountry) {
    score += 1;
    reasons.push("target_country");
  }

  return { score, reasons };
}

function qualityFromScore(score: number) {
  if (score >= 7) return "strong";
  if (score >= 4) return "medium";
  if (score >= 2) return "weak";
  return "none";
}

function missingIdentifiersFor(link: CampaignLinkRecord) {
  const missing: string[] = [];
  if (!link.platform) missing.push("platform");
  if (!link.utmCampaign && !link.utmId && !link.campaignId) missing.push("campaign_id_or_utm_campaign");
  if (!link.adsetId && !link.adGroupId) missing.push("adset_id_or_ad_group_id");
  if (!link.adId) missing.push("ad_id");
  if (!link.targetCountry) missing.push("target_country");
  return missing;
}

function hasCampaignOrAdIdentifiers(link: CampaignLinkRecord) {
  return Boolean(link.utmCampaign || link.utmId || link.campaignId || link.adsetId || link.adGroupId || link.adId);
}

function emptyTruthBucket() {
  return { sent: 0, failed: 0, skipped: 0, pending: 0, total: 0 };
}

function countStatus(bucket: ReturnType<typeof emptyTruthBucket>, status?: string) {
  bucket.total += 1;
  if (status === "SENT") bucket.sent += 1;
  else if (status === "FAILED") bucket.failed += 1;
  else if (status === "SKIPPED") bucket.skipped += 1;
  else bucket.pending += 1;
}

function buildTrackingTruth(args: {
  link: CampaignLinkRecord;
  donations: string[];
  clickIdDonations: string[];
  eventsByDonationId: Map<string, ConversionEventLike[]>;
  strongMatches: number;
}) {
  const matchedDonations = [...new Set(args.donations)];
  const clickIdDonations = [...new Set(args.clickIdDonations)];
  const truth = {
    totalMatchedDonations: matchedDonations.length,
    donationsWithConversionEvent: 0,
    clickIdDonations: clickIdDonations.length,
    platformConversionsSent: 0,
    sampleDonationIds: matchedDonations.slice(0, 5),
    meta: { server: emptyTruthBucket(), browser: emptyTruthBucket() },
    ga4: emptyTruthBucket(),
    googleAds: { server: emptyTruthBucket(), browser: emptyTruthBucket() },
    tiktok: { server: emptyTruthBucket(), browser: emptyTruthBucket() },
    x: { browser: emptyTruthBucket() },
    warnings: [] as string[],
  };
  const donationsWithEvents = new Set<string>();

  for (const donationId of matchedDonations) {
    const events = args.eventsByDonationId.get(donationId) ?? [];
    if (events.length > 0) donationsWithEvents.add(donationId);
    for (const event of events) {
      const platform = (event.platform || "").toUpperCase();
      const channel = (event.channel || "").toLowerCase();
      if (event.status === "SENT") truth.platformConversionsSent += 1;
      if (platform === "META" && channel === "server") countStatus(truth.meta.server, event.status);
      else if (platform === "META" && channel === "browser") countStatus(truth.meta.browser, event.status);
      else if (platform === "GA4") countStatus(truth.ga4, event.status);
      else if (platform === "GOOGLE_ADS" && channel === "server") countStatus(truth.googleAds.server, event.status);
      else if (platform === "GOOGLE_ADS" && channel === "browser") countStatus(truth.googleAds.browser, event.status);
      else if (platform === "TIKTOK" && channel === "server") countStatus(truth.tiktok.server, event.status);
      else if (platform === "TIKTOK" && channel === "browser") countStatus(truth.tiktok.browser, event.status);
      else if (platform === "X" && channel === "browser") countStatus(truth.x.browser, event.status);
    }
  }

  truth.donationsWithConversionEvent = donationsWithEvents.size;
  if (matchedDonations.length > 0 && truth.meta.server.sent === 0) truth.warnings.push("الرابط جلب تبرعات لكن Meta server ناقص");
  if (matchedDonations.length > 0 && truth.meta.browser.skipped > 0) truth.warnings.push("الرابط جلب تبرعات لكن browser skipped");
  if (args.strongMatches > 0 && truth.ga4.sent === 0) truth.warnings.push("الرابط قوي لكن GA4 purchase ناقص");
  if (clickIdDonations.length > 0 && truth.platformConversionsSent === 0) truth.warnings.push("الرابط فيه click IDs لكن لا توجد platform conversions");
  if (!args.link.campaignId && !args.link.utmCampaign && !args.link.utmId) truth.warnings.push("الرابط بدون campaign identifiers");
  return truth;
}

function buildActionQueue(args: {
  link: CampaignLinkRecord;
  linkId: string;
  status: string;
  donations: number;
  revenue: number;
  strong: number;
  medium: number;
  weak: number;
  missingIdentifiers: string[];
  matchedDonationsMissingConversions: number;
}): CampaignAction[] {
  const items: CampaignAction[] = [];
  const { link, linkId, status, donations, revenue, strong, medium, weak, missingIdentifiers, matchedDonationsMissingConversions } = args;

  if (status !== "ACTIVE") {
    items.push({
      id: `inactive-${linkId}`,
      priority: "LOW",
      title: status === "ARCHIVED" ? "رابط مؤرشف" : "رابط محذوف منطقيًا",
      description: "احتفظ به كسجل تاريخي ولا تستخدمه في حملة جديدة إلا بعد الاستعادة.",
      action: "استعد الرابط فقط إذا عاد للاستخدام التشغيلي.",
    });
    return items;
  }

  if (donations > 0 && matchedDonationsMissingConversions > 0) {
    items.push({
      id: `missing-conversions-${linkId}`,
      priority: "HIGH",
      title: "تبرعات مطابقة بدون تحويلات كاملة",
      description: `${matchedDonationsMissingConversions} تبرع مرتبط بهذا الرابط لا يظهر عليه اكتمال إرسال التحويلات.`,
      action: "راجع ConversionEvent Ledger ثم شغل retry للتحويلات الناقصة قبل الحكم على أداء المنصة.",
    });
  }

  if (donations === 0 && hasCampaignOrAdIdentifiers(link)) {
    items.push({
      id: `no-donations-${linkId}`,
      priority: "MEDIUM",
      title: "رابط بمعرفات حملة بدون تبرعات",
      description: "الرابط مجهز للتتبع لكنه لم يطابق أي تبرع ضمن الفترة المحددة.",
      action: "راجع الاستهداف وصفحة الهبوط، ولا تزود الميزانية حتى تظهر أول إشارة تبرع.",
    });
  }

  if (missingIdentifiers.includes("campaign_id_or_utm_campaign")) {
    items.push({
      id: `missing-campaign-${linkId}`,
      priority: "HIGH",
      title: "Campaign identifier ناقص",
      description: "لا يوجد Campaign ID أو UTM Campaign كافٍ لربط التبرعات بالحملة بثقة.",
      action: "أضف Campaign ID أو UTM Campaign من صفحة إدارة الروابط.",
    });
  }

  if (missingIdentifiers.includes("ad_id") && ["META", "GOOGLE_ADS", "TIKTOK", "X"].includes((link.platform || "").toUpperCase())) {
    items.push({
      id: `missing-ad-${linkId}`,
      priority: "MEDIUM",
      title: "Ad ID ناقص",
      description: "المطابقة قد تبقى على مستوى الحملة فقط بدون معرفة الإعلان الرابح.",
      action: "أضف Ad ID أو استخدم macro رسمي من المنصة عند توليد الرابط.",
    });
  }

  if (donations > 0 && strong === 0 && (medium > 0 || weak > 0)) {
    items.push({
      id: `weak-match-${linkId}`,
      priority: "MEDIUM",
      title: "مطابقة موجودة لكنها ليست قوية",
      description: `يوجد ${medium} مطابقات متوسطة و${weak} ضعيفة بدون مطابقة قوية.`,
      action: "وحّد Campaign ID وAd ID بين الرابط، التبرع، وأحداث التحويل.",
    });
  }

  if (donations > 0 && revenue > 0 && strong > 0 && items.length === 0) {
    items.push({
      id: `scale-ready-${linkId}`,
      priority: "LOW",
      title: "جاهز للتوسيع الحذر",
      description: "الرابط لديه إيراد ومطابقة قوية ولا تظهر فجوة تحويل حرجة.",
      action: "استمر بالمراقبة ويمكن اختبار زيادة ميزانية تدريجية.",
    });
  }

  if (items.length === 0) {
    items.push({
      id: `monitor-${linkId}`,
      priority: "LOW",
      title: "قيد المراقبة",
      description: "لا توجد إشارة كافية لاتخاذ قرار حاد بعد.",
      action: "اترك الرابط يعمل حتى تتجمع زيارات وتبرعات أكثر.",
    });
  }

  const weight: Record<ActionPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return items.sort((a, b) => weight[b.priority] - weight[a.priority]);
}

function recommendationFor(args: {
  status: string;
  donations: number;
  revenue: number;
  strong: number;
  medium: number;
  campaignId?: string | null;
  adId?: string | null;
  utmCampaign?: string | null;
}) {
  const { status, donations, revenue, strong, medium, campaignId, adId, utmCampaign } = args;
  if (status === "DELETED") return { tone: "neutral" as RecommendationTone, label: "محذوف", action: "لا يحتاج متابعة إلا إذا أردت استعادته." };
  if (status === "ARCHIVED") return { tone: "neutral" as RecommendationTone, label: "مؤرشف", action: "احتفظ به كسجل تاريخي ولا تستخدمه لحملات جديدة." };
  if (donations > 0 && strong > 0) return { tone: "good" as RecommendationTone, label: "رابط قوي", action: "استمر في استخدامه، ويمكن زيادة الميزانية أو تكرار نفس البنية في حملات مشابهة." };
  if (donations > 0 && strong === 0 && medium > 0) return { tone: "warning" as RecommendationTone, label: "إسناد يحتاج تحسين", action: "راجع Campaign ID وAd ID داخل الرابط حتى تصبح المطابقة أقوى." };
  if (donations === 0 && (campaignId || adId || utmCampaign)) return { tone: "warning" as RecommendationTone, label: "بدون تبرعات", action: "راجع الاستهداف أو صفحة الهبوط، ولا تزود الميزانية قبل ظهور أول تبرع." };
  if (!campaignId && !utmCampaign) return { tone: "danger" as RecommendationTone, label: "ناقص بيانات", action: "أضف Campaign ID أو UTM Campaign حتى يمكن ربط التبرعات بالحملة." };
  if (revenue === 0) return { tone: "warning" as RecommendationTone, label: "لم يحقق إيراد", action: "استخدمه للاختبار فقط أو أوقفه إذا كان منشورًا في حملة نشطة." };
  return { tone: "neutral" as RecommendationTone, label: "قيد المراقبة", action: "راقب الأداء بعد وصول المزيد من الزيارات والتبرعات." };
}

async function getConversionEventsForDonations(donationIds: string[]): Promise<ConversionEventLike[]> {
  const ids = [...new Set(donationIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const result = await prisma.$runCommandRaw(rawCommand({
    find: "ConversionEvent",
    filter: { donationId: { $in: ids } },
    projection: { donationId: 1, platform: 1, channel: 1, eventName: 1, status: 1 },
    limit: Math.min(5000, Math.max(100, ids.length * 12)),
  })) as JsonMap;
  const rows = isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch : [];
  return rows.filter(isMap) as ConversionEventLike[];
}

export async function buildCampaignLinkPerformanceReport(query: CampaignLinkPerformanceQuery) {
  const platform = query.platform?.toUpperCase() === "ALL" ? null : query.platform;
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - query.days + 1);
  from.setHours(0, 0, 0, 0);

  const [links, donations] = await Promise.all([
    listCampaignLinks({ limit: query.limit, platform, status: query.status }),
    prisma.donation.findMany({
      where: { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER },
      select: { id: true, amount: true, amountUSD: true, currency: true, createdAt: true, paidAt: true, conversionEventsSentAt: true, attribution: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
  ]);

  const rowDrafts = links.map((link) => {
    const id = link.id || `${link.platform || "UNKNOWN"}:${link.campaignId || link.utmCampaign || link.url || "link"}`;
    let donationsCount = 0;
    let revenue = 0;
    let strongMatches = 0;
    let mediumMatches = 0;
    let weakMatches = 0;
    let matchedDonationsMissingConversions = 0;
    const matchReasons = new Map<string, number>();
    const sampleDonations: Array<{ id: string; revenue: number; score: number; quality: string; reasons: string[]; createdAt: string; conversionEventsSentAt: string | null }> = [];
    const matchedDonationIds: string[] = [];
    const clickIdDonationIds: string[] = [];

    if (linkStatus(link) !== "DELETED") {
      for (const donation of donations) {
        const match = scoreMatch(link, donation.attribution);
        if (match.score < 2) continue;
        const value = donationRowUsdApprox(donation);
        donationsCount += 1;
        revenue += value;
        matchedDonationIds.push(donation.id);
        if (hasClickId(donation.attribution)) clickIdDonationIds.push(donation.id);
        const quality = qualityFromScore(match.score);
        if (quality === "strong") strongMatches += 1;
        else if (quality === "medium") mediumMatches += 1;
        else weakMatches += 1;
        if (!donation.conversionEventsSentAt) matchedDonationsMissingConversions += 1;
        for (const reason of match.reasons) matchReasons.set(reason, (matchReasons.get(reason) || 0) + 1);
        if (sampleDonations.length < 10) {
          sampleDonations.push({
            id: donation.id,
            revenue: value,
            score: match.score,
            quality,
            reasons: match.reasons,
            createdAt: donation.createdAt.toISOString(),
            conversionEventsSentAt: donation.conversionEventsSentAt?.toISOString() ?? null,
          });
        }
      }
    }

    const currentStatus = linkStatus(link);
    const missingIdentifiers = missingIdentifiersFor(link);
    const recommendation = recommendationFor({
      status: currentStatus,
      donations: donationsCount,
      revenue,
      strong: strongMatches,
      medium: mediumMatches,
      campaignId: link.campaignId,
      adId: link.adId,
      utmCampaign: link.utmCampaign,
    });

    return {
      id,
      name: link.name || link.utmCampaign || link.campaignId || "Marketing link",
      platform: link.platform || null,
      channel: link.channel || null,
      url: link.url || null,
      status: currentStatus,
      saveCount: typeof link.saveCount === "number" ? link.saveCount : 0,
      createdAt: link.createdAt || null,
      updatedAt: link.updatedAt || null,
      identifiers: {
        utmSource: link.utmSource || null,
        utmMedium: link.utmMedium || null,
        utmCampaign: link.utmCampaign || null,
        utmId: link.utmId || null,
        utmContent: link.utmContent || null,
        campaignId: link.campaignId || null,
        adsetId: link.adsetId || null,
        adGroupId: link.adGroupId || null,
        adId: link.adId || null,
        targetCountry: link.targetCountry || null,
      },
      metadata: {
        objective: link.objective || null,
        audienceSegment: link.audienceSegment || null,
        messageVariant: link.messageVariant || null,
        internalNotes: link.internalNotes || null,
      },
      recommendation,
      performance: {
        donations: donationsCount,
        revenue,
        averageDonation: donationsCount > 0 ? revenue / donationsCount : 0,
        matchQuality: { strong: strongMatches, medium: mediumMatches, weak: weakMatches },
        matchReasons: Object.fromEntries([...matchReasons.entries()].sort((a, b) => b[1] - a[1])),
      },
      intelligence: {
        missingIdentifiers,
        conversionGaps: { matchedDonationsMissingConversions },
        actionQueue: buildActionQueue({
          link,
          linkId: id,
          status: currentStatus,
          donations: donationsCount,
          revenue,
          strong: strongMatches,
          medium: mediumMatches,
          weak: weakMatches,
          missingIdentifiers,
          matchedDonationsMissingConversions,
        }),
      },
      samples: sampleDonations,
      _link: link,
      _matchedDonationIds: matchedDonationIds,
      _clickIdDonationIds: clickIdDonationIds,
    };
  });

  const conversionEvents = await getConversionEventsForDonations(rowDrafts.flatMap((row) => row._matchedDonationIds));
  const eventsByDonationId = new Map<string, ConversionEventLike[]>();
  for (const event of conversionEvents) {
    if (!event.donationId) continue;
    eventsByDonationId.set(event.donationId, [...(eventsByDonationId.get(event.donationId) ?? []), event]);
  }

  const rows = rowDrafts.map(({ _link, _matchedDonationIds, _clickIdDonationIds, ...row }) => ({
    ...row,
    trackingTruth: buildTrackingTruth({
      link: _link,
      donations: _matchedDonationIds,
      clickIdDonations: _clickIdDonationIds,
      eventsByDonationId,
      strongMatches: row.performance.matchQuality.strong,
    }),
  })).sort((a, b) => b.performance.revenue - a.performance.revenue);

  const requestedId = query.id;
  const visibleRows = requestedId ? rows.filter((row) => row.id === requestedId || encodeURIComponent(row.id) === requestedId) : rows;

  return {
    ok: true,
    range: { from: dateKey(from), to: dateKey(to), days: query.days, dateBasis: "createdAt" },
    status: query.status,
    links: visibleRows,
    summary: {
      links: visibleRows.length,
      activeLinks: visibleRows.filter((row) => row.status === "ACTIVE").length,
      archivedLinks: visibleRows.filter((row) => row.status === "ARCHIVED").length,
      deletedLinks: visibleRows.filter((row) => row.status === "DELETED").length,
      linksWithDonations: visibleRows.filter((row) => row.performance.donations > 0).length,
      donationsConsidered: donations.length,
      revenueMatched: visibleRows.reduce((sum, row) => sum + row.performance.revenue, 0),
      linksWithMissingConversions: visibleRows.filter((row) => row.intelligence.conversionGaps.matchedDonationsMissingConversions > 0).length,
      highPriorityActions: visibleRows.reduce((sum, row) => sum + row.intelligence.actionQueue.filter((item) => item.priority === "HIGH").length, 0),
    },
  };
}
