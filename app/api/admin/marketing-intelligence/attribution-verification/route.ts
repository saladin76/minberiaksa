import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { syncDonationConversion } from "@/lib/tracking/donation-conversion-server";
import { metaDonationEventId } from "@/lib/tracking/canonical";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;
type VerificationStatus = "PENDING" | "LIKELY_COUNTED" | "NOT_CONFIRMED" | "RETRIED" | "NEEDS_REVIEW" | "NO_AD_ATTRIBUTION";

function isMap(value: unknown): value is JsonMap { return typeof value === "object" && value !== null && !Array.isArray(value); }
function str(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function dateOrNull(value: unknown) { const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d : null; }
function oidFilter(id: string) { return /^[a-f0-9]{24}$/i.test(id) ? { $oid: id } : id; }

function hasAdAttribution(attribution: unknown) {
  if (!isMap(attribution)) return false;
  return Boolean(str(attribution.fbclid) || str(attribution.fbc) || str(attribution.fbp) || str(attribution.campaign_id) || str(attribution.campaignId) || str(attribution.ad_id) || str(attribution.adId) || str(attribution.utm_source));
}
function campaignId(attribution: unknown) { return isMap(attribution) ? str(attribution.campaign_id) || str(attribution.campaignId) || str(attribution.utm_id) || str(attribution.utm_campaign) : ""; }
function adId(attribution: unknown) { return isMap(attribution) ? str(attribution.ad_id) || str(attribution.adId) || str(attribution.utm_content) : ""; }
function platform(attribution: unknown) {
  if (!isMap(attribution)) return "META";
  const source = `${str(attribution.utm_source)} ${str(attribution.platform)} ${str(attribution.source)}`.toLowerCase();
  if (source.includes("google")) return "GOOGLE_ADS";
  if (source.includes("tiktok")) return "TIKTOK";
  if (source.includes("x") || source.includes("twitter")) return "X";
  return "META";
}

async function ensureIndexes() {
  await prisma.$runCommandRaw({ createIndexes: "MarketingAttributionVerification", indexes: [
    { key: { donationId: 1, platform: 1 }, name: "donation_platform_unique", unique: true },
    { key: { status: 1, nextCheckAt: 1 }, name: "status_nextCheckAt" },
    { key: { updatedAt: -1 }, name: "updatedAt_desc" },
  ] }).catch(() => null);
}

async function getConversionEvents(donationId: string, eventId: string) {
  const result = await prisma.$runCommandRaw({ find: "ConversionEvent", filter: { $or: [{ donationId }, { donationId: oidFilter(donationId) }, { eventId }] }, sort: { updatedAt: -1 }, limit: 50 }) as JsonMap;
  return isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
}

async function hasPlatformCredit(row: { platform: string; campaignId: string; adId: string; paidAt: Date | null }) {
  if (!row.campaignId && !row.adId) return false;
  const paid = row.paidAt ?? new Date();
  const date = paid.toISOString().slice(0, 10);
  const or: JsonMap[] = [];
  if (row.campaignId) or.push({ campaignId: row.campaignId }, { campaignName: row.campaignId });
  if (row.adId) or.push({ adId: row.adId });
  const result = await prisma.$runCommandRaw({ find: "MarketingPlatformDailyMetric", filter: { platform: row.platform, date: { $gte: date }, ...(or.length ? { $or: or } : {}) }, sort: { date: -1, updatedAt: -1 }, limit: 20 }).catch(() => null) as JsonMap | null;
  const rows = isMap(result?.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
  return rows.some((m) => num(m.conversions) > 0 || num(m.revenue) > 0);
}

async function upsertVerification(input: { donationId: string; platform: string; eventId: string; value: number; currency: string; paidAt: Date | null; campaignId: string; adId: string; attribution: unknown; }) {
  const now = new Date();
  const nextCheckAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  await prisma.$runCommandRaw({ update: "MarketingAttributionVerification", updates: [{ q: { donationId: input.donationId, platform: input.platform }, u: { $set: { ...input, updatedAt: now }, $setOnInsert: { createdAt: now, status: "PENDING", attempts: 0, nextCheckAt, history: [] } }, upsert: true }] });
}

async function seedRecent() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const donations = await prisma.donation.findMany({ where: { status: "PAID", paidAt: { not: null, gte: since } }, orderBy: { paidAt: "desc" }, take: 100, select: { id: true, amount: true, totalAmount: true, teamSupport: true, fees: true, currency: true, paidAt: true, attribution: true } });
  for (const d of donations) {
    if (!hasAdAttribution(d.attribution)) continue;
    const value = Number(d.totalAmount || 0) > 0 ? Number(d.totalAmount) : Number(d.amount || 0) + Number(d.teamSupport || 0) + Number(d.fees || 0);
    await upsertVerification({ donationId: d.id, platform: platform(d.attribution), eventId: metaDonationEventId(d.id, "success"), value, currency: d.currency || "USD", paidAt: d.paidAt, campaignId: campaignId(d.attribution), adId: adId(d.attribution), attribution: d.attribution });
  }
}

async function listRows(limit = 100) {
  const result = await prisma.$runCommandRaw({ find: "MarketingAttributionVerification", filter: {}, sort: { updatedAt: -1 }, limit }) as JsonMap;
  return isMap(result.cursor) && Array.isArray(result.cursor.firstBatch) ? result.cursor.firstBatch.filter(isMap) : [];
}

async function updateVerification(donationId: string, platform: string, update: JsonMap) {
  await prisma.$runCommandRaw({ update: "MarketingAttributionVerification", updates: [{ q: { donationId, platform }, u: { $set: { ...update, updatedAt: new Date() }, $push: { history: { at: new Date(), ...update } } } }] });
}

async function processOne(row: JsonMap, retry: boolean) {
  const donationId = str(row.donationId);
  const rowPlatform = str(row.platform) || "META";
  const eventId = str(row.eventId) || metaDonationEventId(donationId, "success");
  const paidAt = dateOrNull(row.paidAt);
  if (!donationId) return { ok: false, error: "missing donationId" };

  const events = await getConversionEvents(donationId, eventId);
  const metaServerSent = events.some((e) => str(e.platform) === "META" && str(e.channel) === "server" && str(e.status) === "SENT");
  const metaBrowserSent = events.some((e) => str(e.platform) === "META" && str(e.channel) === "browser" && str(e.status) === "SENT");
  const metaBrowserSkipped = events.some((e) => str(e.platform) === "META" && str(e.channel) === "browser" && str(e.status) === "SKIPPED");
  const platformCredit = await hasPlatformCredit({ platform: rowPlatform, campaignId: str(row.campaignId), adId: str(row.adId), paidAt });

  let status: VerificationStatus = "PENDING";
  let reason = "في انتظار ظهور بيانات المنصة";
  if (metaServerSent && metaBrowserSent) { status = platformCredit ? "LIKELY_COUNTED" : "NOT_CONFIRMED"; reason = platformCredit ? "Browser + Server تم إرسالهما وبيانات المنصة تظهر تحويل/قيمة" : "Browser + Server تم إرسالهما لكن بيانات المنصة لم تظهر التحويل بعد"; }
  else if (metaServerSent && metaBrowserSkipped) { status = "NOT_CONFIRMED"; reason = "Server SENT لكن Browser Pixel لم ينجح"; }
  else if (metaServerSent) { status = "NOT_CONFIRMED"; reason = "Server SENT فقط، Browser غير مثبت"; }
  else { status = "NOT_CONFIRMED"; reason = "لا يوجد META server SENT مثبت"; }

  const attempts = num(row.attempts);
  const ageMs = paidAt ? Date.now() - paidAt.getTime() : 0;
  const canRetry = retry && rowPlatform === "META" && attempts < 3 && ageMs < 7 * 24 * 60 * 60 * 1000 && status !== "LIKELY_COUNTED";
  let retryResult: unknown = null;
  if (canRetry) { retryResult = await syncDonationConversion(donationId, { force: true }); status = "RETRIED"; reason = `${reason} — تمت إعادة إرسال CAPI بنفس event_id`; }
  else if (attempts >= 3 && status !== "LIKELY_COUNTED") { status = "NEEDS_REVIEW"; reason = `${reason} — وصل للحد الأقصى من المحاولات`; }

  await updateVerification(donationId, rowPlatform, { status, reason, metaServerSent, metaBrowserSent, metaBrowserSkipped, platformCredit, lastCheckedAt: new Date(), nextCheckAt: status === "LIKELY_COUNTED" || status === "NEEDS_REVIEW" ? null : new Date(Date.now() + 2 * 60 * 60 * 1000), attempts: canRetry ? attempts + 1 : attempts, lastRetryResult: retryResult });
  return { ok: true, donationId, status, reason, metaServerSent, metaBrowserSent, platformCredit, retried: canRetry };
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;
  await ensureIndexes();
  await seedRecent();
  const limit = Math.max(1, Math.min(200, Math.floor(Number(request.nextUrl.searchParams.get("limit") || 100))));
  const rows = await listRows(limit);
  return NextResponse.json({ ok: true, rows, summary: { total: rows.length, pending: rows.filter((r) => str(r.status) === "PENDING").length, likelyCounted: rows.filter((r) => str(r.status) === "LIKELY_COUNTED").length, needsReview: rows.filter((r) => str(r.status) === "NEEDS_REVIEW").length } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;
  await ensureIndexes();
  await seedRecent();
  const body = await request.json().catch(() => ({})) as JsonMap;
  const donationId = str(body.donationId);
  const retry = Boolean(body.retry);
  const rows = await listRows(200);
  const targets = donationId ? rows.filter((r) => str(r.donationId) === donationId) : rows.filter((r) => ["PENDING", "NOT_CONFIRMED", "RETRIED"].includes(str(r.status))).slice(0, 25);
  const results = [];
  for (const row of targets) results.push(await processOne(row, retry));
  return NextResponse.json({ ok: true, processed: results.length, results }, { headers: { "Cache-Control": "no-store" } });
}
