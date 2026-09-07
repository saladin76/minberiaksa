import { prisma } from "@/lib/prisma";
import { sendDonationServerConversions } from "@/lib/tracking/donation-conversion-server";

type JsonMap = Record<string, unknown>;

type VerificationStatus = "PENDING" | "CONFIRMED" | "RETRYING" | "EXHAUSTED" | "SKIPPED";

function isMap(value: unknown): value is JsonMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function attribution(row: { attribution: unknown }) {
  return isMap(row.attribution) ? row.attribution : {};
}

function pickId(a: JsonMap, keys: string[]) {
  for (const key of keys) {
    const value = str(a[key]);
    if (value) return value;
  }
  return "";
}

function nextCheckDate(attempts: number) {
  const minutes = attempts <= 0 ? 45 : attempts === 1 ? 120 : attempts === 2 ? 360 : 720;
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function ensureIndexes() {
  await prisma.$runCommandRaw({
    createIndexes: "MarketingConversionVerification",
    indexes: [
      { key: { donationId: 1, platform: 1 }, name: "donation_platform", unique: true },
      { key: { status: 1, nextCheckAt: 1 }, name: "status_nextCheckAt" },
      { key: { campaignId: 1, adsetId: 1, adId: 1 }, name: "campaign_ad_keys" },
      { key: { createdAt: -1 }, name: "createdAt_desc" },
    ],
  }).catch(() => null);
}

async function latestPlatformCredit(platform: string, campaignId: string, adsetId: string, adId: string) {
  const or: JsonMap[] = [];
  if (adId) or.push({ adId });
  if (adsetId) or.push({ adsetId });
  if (campaignId) or.push({ campaignId });
  if (or.length === 0) return { credited: false, revenue: 0, conversions: 0, matchedBy: "none" };

  const result = await prisma.$runCommandRaw({
    find: "MarketingPlatformDailyMetric",
    filter: { platform, $or: or },
    sort: { date: -1, updatedAt: -1, createdAt: -1 },
    limit: 30,
  }).catch(() => null) as JsonMap | null;

  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  let revenue = 0;
  let conversions = 0;
  let matchedBy = "none";
  for (const row of rows) {
    revenue += num(row.revenue);
    conversions += num(row.conversions);
    if (adId && str(row.adId) === adId) matchedBy = "adId";
    else if (adsetId && str(row.adsetId) === adsetId && matchedBy === "none") matchedBy = "adsetId";
    else if (campaignId && str(row.campaignId) === campaignId && matchedBy === "none") matchedBy = "campaignId";
  }
  return { credited: conversions > 0 || revenue > 0, revenue, conversions, matchedBy };
}

export async function enqueueDonationConversionVerification(donationId: string, platform = "META") {
  await ensureIndexes();
  const row = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { id: true, status: true, paidAt: true, attribution: true, currency: true, totalAmount: true, amount: true, teamSupport: true, fees: true },
  });
  if (!row || row.status !== "PAID" || !row.paidAt) return { ok: false, skipped: true, reason: "donation not paid" };

  const a = attribution(row);
  const campaignId = pickId(a, ["campaign_id", "utm_id", "utm_campaign", "campaignId"]);
  const adsetId = pickId(a, ["adset_id", "adgroup_id", "ad_group_id", "adsetId"]);
  const adId = pickId(a, ["ad_id", "adId"]);
  const source = pickId(a, ["utm_source", "source", "platform"]);
  const eventId = `donate_${donationId}`;
  const total = num(row.totalAmount) || num(row.amount) + num(row.teamSupport) + num(row.fees);

  const document = {
    donationId,
    platform,
    eventName: "Donate",
    eventId,
    status: "PENDING" as VerificationStatus,
    attempts: 0,
    maxAttempts: 4,
    nextCheckAt: nextCheckDate(0),
    campaignId: campaignId || null,
    adsetId: adsetId || null,
    adId: adId || null,
    source: source || null,
    expectedValue: total,
    currency: row.currency || "USD",
    lastCheck: null,
    lastRetry: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await prisma.$runCommandRaw({
    update: "MarketingConversionVerification",
    updates: [{ q: { donationId, platform }, u: { $setOnInsert: document, $set: { updatedAt: new Date() } }, upsert: true }],
  });
  return { ok: true, queued: true, donationId, platform, eventId };
}

export async function processConversionVerificationQueue(limit = 20) {
  await ensureIndexes();
  const now = new Date();
  const result = await prisma.$runCommandRaw({
    find: "MarketingConversionVerification",
    filter: { status: { $in: ["PENDING", "RETRYING"] }, nextCheckAt: { $lte: now } },
    sort: { nextCheckAt: 1, createdAt: 1 },
    limit,
  }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  const processed: JsonMap[] = [];

  for (const row of rows) {
    const donationId = str(row.donationId);
    const platform = str(row.platform) || "META";
    const attempts = num(row.attempts);
    const maxAttempts = num(row.maxAttempts) || 4;
    const campaignId = str(row.campaignId);
    const adsetId = str(row.adsetId);
    const adId = str(row.adId);

    const credit = await latestPlatformCredit(platform, campaignId, adsetId, adId);
    if (credit.credited) {
      await prisma.$runCommandRaw({ update: "MarketingConversionVerification", updates: [{ q: { donationId, platform }, u: { $set: { status: "CONFIRMED", confirmedAt: new Date(), lastCheck: credit, updatedAt: new Date() } } }] });
      processed.push({ donationId, platform, status: "CONFIRMED", credit });
      continue;
    }

    if (attempts >= maxAttempts) {
      await prisma.$runCommandRaw({ update: "MarketingConversionVerification", updates: [{ q: { donationId, platform }, u: { $set: { status: "EXHAUSTED", lastCheck: credit, updatedAt: new Date() } } }] });
      processed.push({ donationId, platform, status: "EXHAUSTED", credit });
      continue;
    }

    const retry = platform === "META" ? await sendDonationServerConversions(donationId, { force: true }) : { ok: false, skipped: true, reason: "platform retry not implemented" };
    const nextAttempts = attempts + 1;
    await prisma.$runCommandRaw({
      update: "MarketingConversionVerification",
      updates: [{
        q: { donationId, platform },
        u: { $set: { status: "RETRYING", attempts: nextAttempts, lastCheck: credit, lastRetry: retry, nextCheckAt: nextCheckDate(nextAttempts), updatedAt: new Date() } },
      }],
    });
    processed.push({ donationId, platform, status: "RETRYING", retry, credit, attempts: nextAttempts });
  }

  return { ok: true, processed };
}

export async function listConversionVerifications(limit = 100) {
  await ensureIndexes();
  const result = await prisma.$runCommandRaw({ find: "MarketingConversionVerification", filter: {}, sort: { updatedAt: -1, createdAt: -1 }, limit }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return { ok: true, rows };
}
