import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER } from "@/lib/dashboard/donation-usd-revenue";

type JsonMap = Record<string, unknown>;
type MatchStatus = "matched" | "platform_only" | "site_only" | "unknown";

type Bucket = {
  key: string;
  label: string;
  source?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  siteDonations: number;
  siteRevenue: number;
  platformSpend: number;
  platformReportedConversions: number;
  platformReportedValue: number;
  matchedStrong: number;
  matchedMedium: number;
  matchedWeak: number;
  siteTouched: boolean;
  platformTouched: boolean;
  matchReason?: string | null;
};

type Row = Bucket & {
  matchStatus: MatchStatus;
  actualRoas: number | null;
  platformRoas: number | null;
  conversionGap: number;
  valueGap: number;
};

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(source: unknown, key: string): string | null {
  if (!isMap(source)) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericParam(request: NextRequest, key: string, fallback: number, min: number, max: number) {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.floor(raw))) : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayRevenue(row: { totalAmount?: number | null; amount: number }) {
  const total = Number(row.totalAmount);
  if (Number.isFinite(total) && total > 0) return total;
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeName(value: string | null | undefined) {
  return value?.normalize("NFKC").toLowerCase().replace(/[|_\-–—/\\]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ") || null;
}

function isIdLike(value: string | null | undefined) {
  const clean = value?.trim();
  return !!clean && (/^\d{8,}$/.test(clean) || /^[a-f0-9]{16,}$/i.test(clean));
}

function cleanAdName(label: string | null | undefined, adId?: string | null) {
  const clean = label?.trim();
  if (!clean || clean === adId || isIdLike(clean)) return "Unnamed ad";
  return clean;
}

function normalizeCountry(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  return clean.length === 2 ? clean.toUpperCase() : clean;
}

function tokenScore(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const aa = new Set(a.split(" ").filter((x) => x.length > 1));
  const bb = new Set(b.split(" ").filter((x) => x.length > 1));
  if (!aa.size || !bb.size) return 0;
  let shared = 0;
  for (const t of aa) if (bb.has(t)) shared += 1;
  return shared / Math.max(aa.size, bb.size);
}

function attributionQuality(attribution: unknown) {
  let score = 0;
  if (str(attribution, "fbclid")) score += 4;
  if (str(attribution, "fbc")) score += 4;
  if (str(attribution, "fbp")) score += 2;
  if (str(attribution, "utm_source") || str(attribution, "utm_campaign") || str(attribution, "utm_medium")) score += 1;
  if (str(attribution, "campaign_id") || str(attribution, "utm_id")) score += 2;
  if (str(attribution, "ad_id")) score += 2;
  if (str(attribution, "adset_id") || str(attribution, "ad_group_id")) score += 1;
  if (score >= 6) return "strong" as const;
  if (score >= 3) return "medium" as const;
  return "weak" as const;
}

function platformFromAttribution(attribution: unknown) {
  const source = str(attribution, "utm_source")?.toLowerCase();
  const channel = str(attribution, "channel")?.toLowerCase();
  if ([source, channel].some((x) => x?.includes("facebook") || x?.includes("instagram") || x?.includes("meta") || x === "ig" || x === "fb")) return "META";
  if ([source, channel].some((x) => x?.includes("google"))) return "GOOGLE_ADS";
  if ([source, channel].some((x) => x?.includes("tiktok"))) return "TIKTOK";
  if ([source, channel].some((x) => x === "x" || x?.includes("twitter"))) return "X";
  return "UNKNOWN";
}

function bucketKey(attribution: unknown) {
  const adId = str(attribution, "ad_id");
  const campaignId = str(attribution, "campaign_id") || str(attribution, "utm_id");
  const campaignName = str(attribution, "utm_campaign") || str(attribution, "campaign_name");
  if (adId) return `ad:${adId}`;
  if (campaignId) return `campaign:${campaignId}`;
  if (campaignName) return `utm:${campaignName}`;
  return "unattributed";
}

function labelFromAttribution(attribution: unknown) {
  return str(attribution, "ad_name") || str(attribution, "utm_content") || str(attribution, "utm_campaign") || str(attribution, "campaign_id") || str(attribution, "utm_id") || "Unattributed";
}

function adsetFromAttribution(attribution: unknown) {
  return str(attribution, "adset_name") || str(attribution, "ad_group_name") || str(attribution, "utm_term");
}

function ensureBucket(map: Map<string, Bucket>, key: string, label: string) {
  let row = map.get(key);
  if (!row) {
    row = { key, label, source: null, campaignId: null, campaignName: null, adsetId: null, adsetName: null, adId: null, siteDonations: 0, siteRevenue: 0, platformSpend: 0, platformReportedConversions: 0, platformReportedValue: 0, matchedStrong: 0, matchedMedium: 0, matchedWeak: 0, siteTouched: false, platformTouched: false, matchReason: null };
    map.set(key, row);
  }
  return row;
}

function indexName(index: Map<string, string>, bucket: Bucket, ...names: Array<string | null | undefined>) {
  for (const name of names) {
    const normalized = normalizeName(name);
    if (normalized && !index.has(normalized)) index.set(normalized, bucket.key);
  }
}

function findByName(buckets: Map<string, Bucket>, index: Map<string, string>, ...names: Array<string | null | undefined>) {
  for (const name of names) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    const key = index.get(normalized);
    if (key) return { bucket: buckets.get(key) ?? null, reason: "name_exact" };
  }

  let best: { bucket: Bucket; score: number } | null = null;
  const candidates = names.map(normalizeName).filter(Boolean) as string[];
  for (const bucket of buckets.values()) {
    if (!bucket.siteTouched) continue;
    const bucketNames = [bucket.label, bucket.campaignName, bucket.campaignId, bucket.adId].map(normalizeName).filter(Boolean) as string[];
    for (const candidate of candidates) for (const bucketName of bucketNames) {
      const current = tokenScore(candidate, bucketName);
      if (current >= 0.72 && (!best || current > best.score)) best = { bucket, score: current };
    }
  }
  return best ? { bucket: best.bucket, reason: `name_similarity_${best.score.toFixed(2)}` } : { bucket: null, reason: null };
}

function findPlatformBucket(buckets: Map<string, Bucket>, index: Map<string, string>, snapshot: { adId?: string | null; campaignId?: string | null; campaignName?: string | null; adName?: string | null }, fallbackKey: string, fallbackLabel: string) {
  if (snapshot.adId) {
    const direct = buckets.get(`ad:${snapshot.adId}`);
    if (direct) return { bucket: direct, reason: "ad_id" };
  }
  if (snapshot.campaignId) {
    const direct = buckets.get(`campaign:${snapshot.campaignId}`);
    if (direct) return { bucket: direct, reason: "campaign_id" };
  }
  const named = findByName(buckets, index, snapshot.adName, snapshot.campaignName);
  if (named.bucket) return { bucket: named.bucket, reason: named.reason ?? "name" };
  return { bucket: ensureBucket(buckets, fallbackKey, fallbackLabel), reason: "platform_only" };
}

function recommendationCards(rows: Row[], summary: { platformSpend: number; siteRevenue: number; weakAttribution: number; cApiMarkedSent: number; paidDonations: number; countryMismatchCount: number }) {
  const cards = [];
  const spendRows = rows.filter((row) => row.platformSpend > 0);
  const scale = spendRows.filter((row) => row.matchStatus === "matched" && (row.actualRoas ?? 0) >= 3 && row.siteDonations >= 2).sort((a, b) => (b.actualRoas ?? 0) - (a.actualRoas ?? 0))[0];
  if (scale) cards.push({ id: `scale:${scale.key}`, priority: "HIGH", type: "SCALE", title: `Scale gradually: ${scale.campaignName || scale.label}`, details: `Actual ROAS ${scale.actualRoas?.toFixed(2)} with ${scale.siteDonations} real donations.`, action: "Increase budget by 15% to 25% for two days, then review actual ROAS.", rowKey: scale.key, campaignName: scale.campaignName, adsetName: scale.adsetName, adName: scale.label, metrics: { actualRoas: scale.actualRoas, siteDonations: scale.siteDonations, siteRevenue: scale.siteRevenue, platformSpend: scale.platformSpend } });
  const waste = spendRows.filter((row) => row.platformSpend >= 10 && row.siteDonations === 0).sort((a, b) => b.platformSpend - a.platformSpend)[0];
  if (waste) cards.push({ id: `waste:${waste.key}`, priority: "HIGH", type: "PAUSE_OR_REVIEW", title: `Review or pause: ${waste.campaignName || waste.label}`, details: `Spend ${waste.platformSpend.toFixed(2)} with no real donations.`, action: "Review targeting, link and landing page before increasing spend.", rowKey: waste.key, campaignName: waste.campaignName, adsetName: waste.adsetName, adName: waste.label, metrics: { platformSpend: waste.platformSpend } });
  if (summary.weakAttribution > 0) cards.push({ id: "weak-attribution", priority: summary.weakAttribution >= 5 ? "HIGH" : "MEDIUM", type: "FIX_ATTRIBUTION", title: "Weak attribution links", details: `${summary.weakAttribution} donations have weak attribution.`, action: "Use Campaign Builder links with campaign and ad identifiers.", metrics: { weakAttribution: summary.weakAttribution } });
  if (summary.cApiMarkedSent < summary.paidDonations) cards.push({ id: "missing-capi", priority: "HIGH", type: "FIX_TRACKING", title: "Some paid donations are not marked as CAPI sent", details: `${summary.cApiMarkedSent} of ${summary.paidDonations} paid donations are marked sent.`, action: "Open Conversion Events and inspect the donation timeline.", metrics: { sent: summary.cApiMarkedSent, paid: summary.paidDonations } });
  if (summary.countryMismatchCount > 0) cards.push({ id: "country-mismatch", priority: "LOW", type: "INVESTIGATE", title: "Country mismatch needs review", details: `${summary.countryMismatchCount} donation rows have a country mismatch.`, action: "Review targeting, donor country and payment country before changing targeting.", metrics: { countryMismatchCount: summary.countryMismatchCount } });
  return cards.slice(0, 8);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = numericParam(request, "days", 7, 1, 90);
  const platform = (request.nextUrl.searchParams.get("platform") || "META").trim().toUpperCase();
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const donationWhere = { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER };
  const donations = await prisma.donation.findMany({
    where: donationWhere,
    select: { id: true, amount: true, totalAmount: true, currency: true, createdAt: true, paidAt: true, donorCountryCode: true, attribution: true, conversionEventsSentAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const siteRevenue = donations.reduce((sum, donation) => sum + displayRevenue(donation), 0);

  const [campaignSnapshots, adSnapshots] = await Promise.all([
    prisma.adCampaignSnapshot.findMany({ where: { platform, date: { gte: from, lte: to } }, select: { campaignId: true, campaignName: true, spend: true, reportedConversions: true, reportedConversionValue: true, currency: true }, take: 5000 }),
    prisma.adSnapshot.findMany({ where: { platform, date: { gte: from, lte: to } }, select: { adId: true, adName: true, campaignId: true, campaignName: true, adGroupId: true, adGroupName: true, spend: true, reportedConversions: true, reportedConversionValue: true, country: true, currency: true }, take: 5000 }),
  ]);

  const buckets = new Map<string, Bucket>();
  const nameIndex = new Map<string, string>();
  const countryMismatches: Array<Record<string, unknown>> = [];
  let platformAttributedDonations = 0;
  let cApiMarkedSent = 0;
  let strong = 0;
  let medium = 0;
  let weak = 0;

  for (const donation of donations) {
    const attribution = donation.attribution;
    const amount = displayRevenue(donation);
    if (donation.conversionEventsSentAt) cApiMarkedSent += 1;
    if (platformFromAttribution(attribution) === platform) platformAttributedDonations += 1;

    const bucket = ensureBucket(buckets, bucketKey(attribution), labelFromAttribution(attribution));
    bucket.siteTouched = true;
    bucket.siteDonations += 1;
    bucket.siteRevenue += amount;
    bucket.source ||= str(attribution, "utm_source") || str(attribution, "channel");
    bucket.campaignId ||= str(attribution, "campaign_id") || str(attribution, "utm_id");
    bucket.campaignName ||= str(attribution, "utm_campaign") || str(attribution, "campaign_name");
    bucket.adsetId ||= str(attribution, "adset_id") || str(attribution, "ad_group_id");
    bucket.adsetName ||= adsetFromAttribution(attribution);
    bucket.adId ||= str(attribution, "ad_id");
    indexName(nameIndex, bucket, bucket.label, bucket.campaignName, bucket.campaignId, bucket.adId);

    const currentQuality = attributionQuality(attribution);
    if (currentQuality === "strong") { strong += 1; bucket.matchedStrong += 1; }
    else if (currentQuality === "medium") { medium += 1; bucket.matchedMedium += 1; }
    else { weak += 1; bucket.matchedWeak += 1; }

    const adCountry = normalizeCountry(str(attribution, "target_country") || str(attribution, "ad_country") || str(attribution, "country"));
    const donorCountry = normalizeCountry(donation.donorCountryCode || str(attribution, "donor_country") || str(attribution, "billing_country"));
    if (adCountry && donorCountry && adCountry !== donorCountry) countryMismatches.push({ donationId: donation.id, amount, currency: donation.currency, adCountry, donorCountry, source: bucket.source, campaign: bucket.campaignName ?? bucket.campaignId, adId: bucket.adId });
  }

  let platformSpend = 0;
  let platformConversions = 0;
  let platformValue = 0;
  for (const snap of campaignSnapshots) {
    platformSpend += snap.spend || 0;
    platformConversions += snap.reportedConversions || 0;
    platformValue += snap.reportedConversionValue || 0;
    const { bucket, reason } = findPlatformBucket(buckets, nameIndex, { campaignId: snap.campaignId, campaignName: snap.campaignName }, `campaign:${snap.campaignId}`, snap.campaignName || snap.campaignId);
    bucket.platformTouched = true;
    bucket.matchReason ||= reason;
    bucket.campaignId ||= snap.campaignId;
    bucket.campaignName ||= snap.campaignName;
    bucket.platformSpend += snap.spend || 0;
    bucket.platformReportedConversions += snap.reportedConversions || 0;
    bucket.platformReportedValue += snap.reportedConversionValue || 0;
    indexName(nameIndex, bucket, bucket.label, bucket.campaignName, snap.campaignName);
  }

  for (const snap of adSnapshots) {
    const name = cleanAdName(snap.adName, snap.adId);
    const { bucket, reason } = findPlatformBucket(buckets, nameIndex, { adId: snap.adId, adName: name, campaignId: snap.campaignId, campaignName: snap.campaignName }, `ad:${snap.adId}`, name);
    bucket.platformTouched = true;
    bucket.matchReason ||= reason;
    bucket.label = cleanAdName(bucket.label, bucket.adId || snap.adId);
    bucket.adId ||= snap.adId;
    bucket.campaignId ||= snap.campaignId;
    bucket.campaignName ||= snap.campaignName;
    bucket.adsetId ||= snap.adGroupName ? null : snap.adGroupId;
    bucket.adsetName ||= snap.adGroupName || snap.adGroupId;
    bucket.platformSpend += snap.spend || 0;
    bucket.platformReportedConversions += snap.reportedConversions || 0;
    bucket.platformReportedValue += snap.reportedConversionValue || 0;
    indexName(nameIndex, bucket, bucket.label, bucket.campaignName, snap.campaignName, name, snap.adGroupName);
  }

  const rows: Row[] = [...buckets.values()].map((row) => ({
    ...row,
    label: cleanAdName(row.label, row.adId),
    adsetId: row.adsetName ? null : row.adsetId,
    matchStatus: row.siteTouched && row.platformTouched ? "matched" : row.platformTouched ? "platform_only" : row.siteTouched ? "site_only" : "unknown",
    actualRoas: row.platformSpend > 0 ? row.siteRevenue / row.platformSpend : null,
    platformRoas: row.platformSpend > 0 ? row.platformReportedValue / row.platformSpend : null,
    conversionGap: row.siteDonations - row.platformReportedConversions,
    valueGap: row.siteRevenue - row.platformReportedValue,
  })).sort((a, b) => Math.max(b.siteRevenue, b.platformReportedValue, b.platformSpend) - Math.max(a.siteRevenue, a.platformReportedValue, a.platformSpend)).slice(0, 100);

  const unmatchedSiteRows = rows.filter((row) => row.matchStatus === "site_only").length;
  const unmatchedPlatformRows = rows.filter((row) => row.matchStatus === "platform_only").length;
  const recommendations: string[] = [];
  if (platformSpend > 0 && siteRevenue === 0) recommendations.push("Platform spend exists without site donations in this period.");
  if (weak > 0) recommendations.push(`${weak} donations have weak attribution.`);
  if (unmatchedSiteRows > 0 || unmatchedPlatformRows > 0) recommendations.push(`Unmatched rows: ${unmatchedSiteRows} site-only and ${unmatchedPlatformRows} platform-only.`);
  if (countryMismatches.length > 0) recommendations.push(`${countryMismatches.length} country mismatches need review.`);
  if (platformConversions > donations.length * 1.4 && donations.length > 0) recommendations.push("Platform conversions are much higher than actual donations; review attribution window.");
  if (cApiMarkedSent < donations.length) recommendations.push("Some paid donations are not marked as CAPI sent.");

  return NextResponse.json({
    ok: true,
    platform,
    range: { from: dateKey(from), to: dateKey(to), days, dateBasis: "createdAt" },
    summary: {
      sitePaidDonations: donations.length,
      siteRevenue,
      revenueBasis: "Dashboard chart total: createdAt range + status=PAID + paidAt set + totalAmount fallback amount",
      platformAttributedDonations,
      cApiMarkedSent,
      platformSpend,
      platformReportedConversions: platformConversions,
      platformReportedValue: platformValue,
      actualRoas: platformSpend > 0 ? siteRevenue / platformSpend : null,
      platformRoas: platformSpend > 0 ? platformValue / platformSpend : null,
      attribution: { strong, medium, weak },
      countryMismatchCount: countryMismatches.length,
      unmatchedSiteRows,
      unmatchedPlatformRows,
      matchedRows: rows.filter((row) => row.matchStatus === "matched").length,
    },
    rows,
    countryMismatches: countryMismatches.slice(0, 100),
    recommendations,
    structuredRecommendations: recommendationCards(rows, { platformSpend, siteRevenue, weakAttribution: weak, cApiMarkedSent, paidDonations: donations.length, countryMismatchCount: countryMismatches.length }),
  });
}
