import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { PAID_DONATION_FILTER, donationRowUsdApprox } from "@/lib/dashboard/donation-usd-revenue";

export const dynamic = "force-dynamic";

type Attribution = Record<string, unknown>;
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

function isRecord(value: unknown): value is Attribution {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(source: unknown, key: string): string | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberParam(request: NextRequest, key: string, fallback: number, min: number, max: number): number {
  const raw = Number(request.nextUrl.searchParams.get(key));
  return Number.isFinite(raw) ? Math.max(min, Math.min(Math.floor(raw), max)) : fallback;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeCountry(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.length === 2 ? v.toUpperCase() : v;
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[|_\-–—/\\]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function isMostlyNumericId(value: string | null | undefined): boolean {
  const clean = value?.trim();
  return !!clean && (/^\d{8,}$/.test(clean) || /^[a-f0-9]{16,}$/i.test(clean));
}

function displayAdLabel(label: string | null | undefined, adId?: string | null) {
  const clean = label?.trim();
  if (!clean || clean === adId || isMostlyNumericId(clean)) return "إعلان بدون اسم";
  return clean;
}

function tokenScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const at = new Set(a.split(" ").filter((x) => x.length > 1));
  const bt = new Set(b.split(" ").filter((x) => x.length > 1));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.max(at.size, bt.size);
}

function attributionQuality(attribution: unknown) {
  let score = 0;
  if (stringValue(attribution, "fbclid")) score += 4;
  if (stringValue(attribution, "fbc")) score += 4;
  if (stringValue(attribution, "fbp")) score += 2;
  if (stringValue(attribution, "utm_source") || stringValue(attribution, "utm_campaign") || stringValue(attribution, "utm_medium")) score += 1;
  if (stringValue(attribution, "campaign_id") || stringValue(attribution, "utm_id")) score += 2;
  if (stringValue(attribution, "ad_id")) score += 2;
  if (stringValue(attribution, "adset_id") || stringValue(attribution, "ad_group_id")) score += 1;
  if (score >= 6) return "strong" as const;
  if (score >= 3) return "medium" as const;
  return "weak" as const;
}

function platformFromAttribution(attribution: unknown) {
  const source = stringValue(attribution, "utm_source")?.toLowerCase();
  const channel = stringValue(attribution, "channel")?.toLowerCase();
  if ([source, channel].some((x) => x?.includes("facebook") || x?.includes("instagram") || x?.includes("meta") || x === "ig" || x === "fb")) return "META";
  if ([source, channel].some((x) => x?.includes("google"))) return "GOOGLE_ADS";
  if ([source, channel].some((x) => x?.includes("tiktok"))) return "TIKTOK";
  if ([source, channel].some((x) => x === "x" || x?.includes("twitter"))) return "X";
  return "UNKNOWN";
}

function bucketKey(attribution: unknown) {
  const adId = stringValue(attribution, "ad_id");
  const campaignId = stringValue(attribution, "campaign_id") || stringValue(attribution, "utm_id");
  const campaignName = stringValue(attribution, "utm_campaign") || stringValue(attribution, "campaign_name");
  if (adId) return `ad:${adId}`;
  if (campaignId) return `campaign:${campaignId}`;
  if (campaignName) return `utm:${campaignName}`;
  return "unattributed";
}

function labelForAttribution(attribution: unknown) {
  return stringValue(attribution, "ad_name")
    || stringValue(attribution, "utm_content")
    || stringValue(attribution, "utm_campaign")
    || stringValue(attribution, "campaign_id")
    || stringValue(attribution, "utm_id")
    || "غير منسوب";
}

function adsetNameFromAttribution(attribution: unknown) {
  return stringValue(attribution, "adset_name")
    || stringValue(attribution, "ad_group_name")
    || stringValue(attribution, "utm_term");
}

function ensureBucket(map: Map<string, Bucket>, key: string, label: string): Bucket {
  let row = map.get(key);
  if (!row) {
    row = {
      key,
      label,
      source: null,
      campaignId: null,
      campaignName: null,
      adsetId: null,
      adsetName: null,
      adId: null,
      siteDonations: 0,
      siteRevenue: 0,
      platformSpend: 0,
      platformReportedConversions: 0,
      platformReportedValue: 0,
      matchedStrong: 0,
      matchedMedium: 0,
      matchedWeak: 0,
      siteTouched: false,
      platformTouched: false,
      matchReason: null,
    };
    map.set(key, row);
  }
  return row;
}

function indexName(index: Map<string, string>, bucket: Bucket, ...names: Array<string | null | undefined>) {
  for (const name of names) {
    const n = normalizeName(name);
    if (n && !index.has(n)) index.set(n, bucket.key);
  }
}

function findBestBucketByName(buckets: Map<string, Bucket>, nameIndex: Map<string, string>, ...names: Array<string | null | undefined>) {
  for (const name of names) {
    const n = normalizeName(name);
    if (!n) continue;
    const key = nameIndex.get(n);
    if (key) return { bucket: buckets.get(key) ?? null, reason: "name_exact" };
  }

  let best: { bucket: Bucket; score: number } | null = null;
  const candidates = names.map(normalizeName).filter(Boolean) as string[];
  for (const bucket of buckets.values()) {
    if (!bucket.siteTouched) continue;
    const bucketNames = [bucket.label, bucket.campaignName, bucket.campaignId, bucket.adId].map(normalizeName).filter(Boolean) as string[];
    for (const a of candidates) {
      for (const b of bucketNames) {
        const current = tokenScore(a, b);
        if (current >= 0.72 && (!best || current > best.score)) best = { bucket, score: current };
      }
    }
  }
  return best ? { bucket: best.bucket, reason: `name_similarity_${best.score.toFixed(2)}` } : { bucket: null, reason: null };
}

function findBucketForPlatformSnapshot(buckets: Map<string, Bucket>, nameIndex: Map<string, string>, snapshot: { adId?: string | null; campaignId?: string | null; campaignName?: string | null; adName?: string | null }, fallbackKey: string, fallbackLabel: string) {
  if (snapshot.adId) {
    const direct = buckets.get(`ad:${snapshot.adId}`);
    if (direct) return { bucket: direct, reason: "ad_id" };
  }
  if (snapshot.campaignId) {
    const direct = buckets.get(`campaign:${snapshot.campaignId}`);
    if (direct) return { bucket: direct, reason: "campaign_id" };
  }
  const byName = findBestBucketByName(buckets, nameIndex, snapshot.adName, snapshot.campaignName);
  if (byName.bucket) return { bucket: byName.bucket, reason: byName.reason ?? "name" };
  return { bucket: ensureBucket(buckets, fallbackKey, fallbackLabel), reason: "platform_only" };
}

function buildStructuredRecommendations(rows: Row[], summary: { platformSpend: number; siteRevenue: number; weakAttribution: number; cApiMarkedSent: number; paidDonations: number; countryMismatchCount: number }) {
  const recs = [];
  const spendRows = rows.filter((r) => r.platformSpend > 0);
  const matchedRows = spendRows.filter((r) => r.matchStatus === "matched");
  const platformOnly = spendRows.filter((r) => r.matchStatus === "platform_only");
  const siteOnly = rows.filter((r) => r.matchStatus === "site_only" && r.siteRevenue > 0);
  const scale = matchedRows.filter((r) => (r.actualRoas ?? 0) >= 3 && r.siteDonations >= 2).sort((a, b) => (b.actualRoas ?? 0) - (a.actualRoas ?? 0))[0];
  if (scale) recs.push({ id: `scale:${scale.key}`, priority: "HIGH", type: "SCALE", title: `زد الميزانية تدريجيًا: ${scale.campaignName || scale.label}`, details: `ROAS الحقيقي ${scale.actualRoas?.toFixed(2)} مع ${scale.siteDonations} تبرعات فعلية.`, action: "ارفع الميزانية 15% إلى 25% لمدة يومين ثم راقب ROAS الحقيقي.", rowKey: scale.key, campaignName: scale.campaignName, adsetName: scale.adsetName, adName: scale.label, metrics: { actualRoas: scale.actualRoas, siteDonations: scale.siteDonations, siteRevenue: scale.siteRevenue, platformSpend: scale.platformSpend } });
  const waste = spendRows.filter((r) => r.platformSpend >= 10 && r.siteDonations === 0).sort((a, b) => b.platformSpend - a.platformSpend)[0];
  if (waste) recs.push({ id: `waste:${waste.key}`, priority: "HIGH", type: "PAUSE_OR_REVIEW", title: `راجع أو أوقف مؤقتًا: ${waste.campaignName || waste.label}`, details: `يوجد صرف ${waste.platformSpend.toFixed(2)} بدون تبرعات فعلية.`, action: "راجع الاستهداف والرابط وصفحة الهبوط، وخفّض الميزانية إن لم يظهر تحسن خلال 24 ساعة.", rowKey: waste.key, campaignName: waste.campaignName, adsetName: waste.adsetName, adName: waste.label, metrics: { platformSpend: waste.platformSpend } });
  if (platformOnly.length) {
    const top = platformOnly.sort((a, b) => b.platformSpend - a.platformSpend)[0];
    recs.push({ id: `platform-only:${top.key}`, priority: "MEDIUM", type: "FIX_ATTRIBUTION", title: "بيانات منصة بدون ربط واضح بتبرعات الموقع", details: `${platformOnly.length} صفوف من المنصة لا تقابلها تبرعات موقع.`, action: "تأكد من استخدام Campaign Builder ووجود utm_campaign/campaign_id/ad_id في روابط الإعلانات.", rowKey: top.key, campaignName: top.campaignName, adsetName: top.adsetName, adName: top.label, metrics: { rows: platformOnly.length, topSpend: top.platformSpend } });
  }
  if (siteOnly.length) {
    const top = siteOnly.sort((a, b) => b.siteRevenue - a.siteRevenue)[0];
    recs.push({ id: `site-only:${top.key}`, priority: "MEDIUM", type: "FIX_ATTRIBUTION", title: "تبرعات فعلية غير مربوطة بصرف المنصة", details: `${siteOnly.length} صفوف من الموقع لا تقابلها بيانات صرف.`, action: "إن كانت التبرعات من إعلانات، اربط الروابط بـ UTM/IDs. وإن كانت عضوية صنفها ك Organic/Direct.", rowKey: top.key, campaignName: top.campaignName, adsetName: top.adsetName, adName: top.label, metrics: { rows: siteOnly.length, topRevenue: top.siteRevenue } });
  }
  if (summary.weakAttribution > 0) recs.push({ id: "weak-attribution", priority: summary.weakAttribution >= 5 ? "HIGH" : "MEDIUM", type: "FIX_ATTRIBUTION", title: "إسناد ضعيف في روابط التبرع", details: `يوجد ${summary.weakAttribution} تبرع بإسناد ضعيف.`, action: "اجعل كل روابط الإعلانات تمر من Campaign Builder.", metrics: { weakAttribution: summary.weakAttribution } });
  if (summary.cApiMarkedSent < summary.paidDonations) recs.push({ id: "missing-capi", priority: "HIGH", type: "FIX_TRACKING", title: "بعض التبرعات لم تُوسم كمرسلة CAPI", details: `الموسوم كمرسل: ${summary.cApiMarkedSent} من أصل ${summary.paidDonations}.`, action: "افتح أحداث التحويل واستخدم Timeline التبرع لمعرفة الفشل ثم أعد المحاولة بعد إصلاح السبب.", metrics: { sent: summary.cApiMarkedSent, paid: summary.paidDonations } });
  if (summary.countryMismatchCount > 0) recs.push({ id: "country-mismatch", priority: "LOW", type: "INVESTIGATE", title: "اختلاف بين دولة الرابط/الإعلان ودولة المتبرع", details: `يوجد ${summary.countryMismatchCount} حالات اختلاف دولة.`, action: "قارن الدولة المستهدفة وIP وبلد المتبرع وبلد البطاقة قبل تغيير الاستهداف.", metrics: { countryMismatchCount: summary.countryMismatchCount } });
  if (summary.platformSpend > 0 && summary.siteRevenue / summary.platformSpend < 1) recs.push({ id: "low-overall-roas", priority: "HIGH", type: "PAUSE_OR_REVIEW", title: "ROAS الحقيقي العام أقل من 1", details: "الإيراد الفعلي أقل من الصرف خلال الفترة المختارة.", action: "خفّض الميزانيات ذات ROAS ضعيف ووجّه الاختبار للحملات ذات تبرعات فعلية مثبتة.", metrics: { actualRoas: summary.siteRevenue / summary.platformSpend, platformSpend: summary.platformSpend, siteRevenue: summary.siteRevenue } });
  return recs.slice(0, 8);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const days = numberParam(request, "days", 7, 1, 90);
  const platform = (request.nextUrl.searchParams.get("platform") || "META").trim().toUpperCase();
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);

  const donationWhere = { createdAt: { gte: from, lte: to }, ...PAID_DONATION_FILTER };
  const donations = await prisma.donation.findMany({
    where: donationWhere,
    select: { id: true, amount: true, amountUSD: true, currency: true, createdAt: true, paidAt: true, donorCountryCode: true, attribution: true, conversionEventsSentAt: true },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  const siteRevenue = donations.reduce((sum, donation) => sum + donationRowUsdApprox(donation), 0);

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
    const amount = donationRowUsdApprox(donation);
    if (donation.conversionEventsSentAt) cApiMarkedSent += 1;
    if (platformFromAttribution(attribution) === platform) platformAttributedDonations += 1;
    const bucket = ensureBucket(buckets, bucketKey(attribution), labelForAttribution(attribution));
    bucket.siteTouched = true;
    bucket.siteDonations += 1;
    bucket.siteRevenue += amount;
    bucket.source ||= stringValue(attribution, "utm_source") || stringValue(attribution, "channel");
    bucket.campaignId ||= stringValue(attribution, "campaign_id") || stringValue(attribution, "utm_id");
    bucket.campaignName ||= stringValue(attribution, "utm_campaign") || stringValue(attribution, "campaign_name");
    bucket.adsetId ||= stringValue(attribution, "adset_id") || stringValue(attribution, "ad_group_id");
    bucket.adsetName ||= adsetNameFromAttribution(attribution);
    bucket.adId ||= stringValue(attribution, "ad_id");
    indexName(nameIndex, bucket, bucket.label, bucket.campaignName, bucket.campaignId, bucket.adId);
    const currentQuality = attributionQuality(attribution);
    if (currentQuality === "strong") { strong += 1; bucket.matchedStrong += 1; }
    else if (currentQuality === "medium") { medium += 1; bucket.matchedMedium += 1; }
    else { weak += 1; bucket.matchedWeak += 1; }
    const adCountry = normalizeCountry(stringValue(attribution, "target_country") || stringValue(attribution, "ad_country") || stringValue(attribution, "country"));
    const donorCountry = normalizeCountry(donation.donorCountryCode || stringValue(attribution, "donor_country") || stringValue(attribution, "billing_country"));
    if (adCountry && donorCountry && adCountry !== donorCountry) countryMismatches.push({ donationId: donation.id, amount, currency: donation.currency, adCountry, donorCountry, source: bucket.source, campaign: bucket.campaignName ?? bucket.campaignId, adId: bucket.adId });
  }

  let platformSpend = 0;
  let platformConversions = 0;
  let platformValue = 0;
  for (const snap of campaignSnapshots) {
    platformSpend += snap.spend || 0;
    platformConversions += snap.reportedConversions || 0;
    platformValue += snap.reportedConversionValue || 0;
    const { bucket, reason } = findBucketForPlatformSnapshot(buckets, nameIndex, { campaignId: snap.campaignId, campaignName: snap.campaignName }, `campaign:${snap.campaignId}`, snap.campaignName || snap.campaignId);
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
    const adName = displayAdLabel(snap.adName, snap.adId);
    const { bucket, reason } = findBucketForPlatformSnapshot(buckets, nameIndex, { adId: snap.adId, adName, campaignId: snap.campaignId, campaignName: snap.campaignName }, `ad:${snap.adId}`, adName);
    bucket.platformTouched = true;
    bucket.matchReason ||= reason;
    bucket.label = displayAdLabel(bucket.label, bucket.adId || snap.adId);
    bucket.adId ||= snap.adId;
    bucket.campaignId ||= snap.campaignId;
    bucket.campaignName ||= snap.campaignName;
    bucket.adsetId ||= snap.adGroupName ? null : snap.adGroupId;
    bucket.adsetName ||= snap.adGroupName || snap.adGroupId;
    bucket.platformSpend += snap.spend || 0;
    bucket.platformReportedConversions += snap.reportedConversions || 0;
    bucket.platformReportedValue += snap.reportedConversionValue || 0;
    indexName(nameIndex, bucket, bucket.label, bucket.campaignName, snap.campaignName, adName, snap.adGroupName);
  }

  const rows: Row[] = [...buckets.values()].map((row) => ({
    ...row,
    label: displayAdLabel(row.label, row.adId),
    adsetId: row.adsetName ? null : row.adsetId,
    matchStatus: row.siteTouched && row.platformTouched ? "matched" : row.platformTouched ? "platform_only" : row.siteTouched ? "site_only" : "unknown",
    actualRoas: row.platformSpend > 0 ? row.siteRevenue / row.platformSpend : null,
    platformRoas: row.platformSpend > 0 ? row.platformReportedValue / row.platformSpend : null,
    conversionGap: row.siteDonations - row.platformReportedConversions,
    valueGap: row.siteRevenue - row.platformReportedValue,
  })).sort((a, b) => Math.max(b.siteRevenue, b.platformReportedValue, b.platformSpend) - Math.max(a.siteRevenue, a.platformReportedValue, a.platformSpend)).slice(0, 100);

  const unmatchedSiteRows = rows.filter((r) => r.matchStatus === "site_only").length;
  const unmatchedPlatformRows = rows.filter((r) => r.matchStatus === "platform_only").length;
  const textRecommendations: string[] = [];
  if (platformSpend > 0 && siteRevenue === 0) textRecommendations.push("يوجد إنفاق منصات بدون تبرعات فعلية في الموقع خلال الفترة؛ راجع الحملات/الدول الأعلى إنفاقًا.");
  if (weak > 0) textRecommendations.push(`يوجد ${weak} تبرع بإسناد ضعيف؛ راجع روابط UTM و fbclid/fbc.`);
  if (unmatchedSiteRows > 0 || unmatchedPlatformRows > 0) textRecommendations.push(`توجد صفوف غير مطابقة: ${unmatchedSiteRows} من الموقع فقط و ${unmatchedPlatformRows} من المنصة فقط؛ راجع أسماء الحملات و UTM/IDs.`);
  if (countryMismatches.length > 0) textRecommendations.push(`يوجد ${countryMismatches.length} اختلاف دولة بين الإعلان/الرابط ودولة المتبرع؛ لا تعتبره خطأ مباشرًا لكن راجعه في الاستهداف والدفع.`);
  if (platformConversions > donations.length * 1.4 && donations.length > 0) textRecommendations.push("نتائج المنصة أعلى بكثير من التبرعات الفعلية؛ راجع attribution window و view-through conversions.");
  if (cApiMarkedSent < donations.length) textRecommendations.push("بعض التبرعات المدفوعة ليست موسومة كمرسلة CAPI؛ شغّل مراجعة التحويلات المفقودة.");

  return NextResponse.json({
    ok: true,
    platform,
    range: { from: dateKey(from), to: dateKey(to), days, dateBasis: "createdAt" },
    summary: {
      sitePaidDonations: donations.length,
      siteRevenue,
      revenueBasis: "Dashboard paid revenue: createdAt range + status=PAID + paidAt set + amountUSD fallback",
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
      matchedRows: rows.filter((r) => r.matchStatus === "matched").length,
    },
    rows,
    countryMismatches: countryMismatches.slice(0, 100),
    recommendations: textRecommendations,
    structuredRecommendations: buildStructuredRecommendations(rows, { platformSpend, siteRevenue, weakAttribution: weak, cApiMarkedSent, paidDonations: donations.length, countryMismatchCount: countryMismatches.length }),
  });
}
