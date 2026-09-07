import { createHmac } from "crypto";
import type { SyncAdGroupSnapshot, SyncAdSnapshot, SyncCampaignSnapshot, SyncClient, SyncClientResult } from "./types";
import { missingConfigResult } from "./types";

const GRAPH_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
type MetaInsightRow = Record<string, unknown>;

function asString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function asNumber(value: unknown): number { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const n = Number(value); return Number.isFinite(n) ? n : 0; } return 0; }
function dayStart(date: string): Date { return new Date(`${date}T00:00:00.000Z`); }
function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
function cleanAccountId(accountId: string): string { const id = accountId.trim(); return id.startsWith("act_") ? id : `act_${id}`; }
function proofForServerCalls(token: string, secret?: string | null): string | null { const clean = secret?.trim(); if (!clean) return null; return createHmac("sha256", clean).update(token).digest("hex"); }

function friendlyMetaError(message: string): { message: string; error: string; missing?: string[] } {
  const lower = message.toLowerCase();
  if (lower.includes("invalid appsecret_proof")) return { message: "فشلت مزامنة Meta لأن App Secret غير مطابق للـ Access Token.", error: "Invalid appsecret_proof: حدّث App Secret الصحيح لنفس Meta App الذي صدر منه Access Token، أو أعد توليد Token من نفس التطبيق.", missing: ["validAppSecret"] };
  if (lower.includes("appsecret_proof") && lower.includes("require")) return { message: "فشلت مزامنة Meta لأن الحساب يتطلب App Secret Proof.", error: "Meta requires appsecret_proof: أضف App Secret الصحيح في اتصال Meta ثم أعد المزامنة.", missing: ["appSecret"] };
  return { message: "فشلت مزامنة Meta Insights API.", error: message.slice(0, 240) };
}

function isDonationActionType(type: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (
    t === "purchase" ||
    t.endsWith(".purchase") ||
    t.includes("pixel_purchase") ||
    t.includes("onsite_conversion.purchase") ||
    t.includes("offsite_conversion.fb_pixel_purchase") ||
    t.includes("donate") ||
    t.includes("donation") ||
    t.includes("completepayment") ||
    t.includes("complete_payment")
  );
}

function metricFromDonationActions(row: MetaInsightRow): number {
  const actions = row.actions;
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    const record = action as Record<string, unknown>;
    if (!isDonationActionType(asString(record.action_type))) continue;
    total += asNumber(record.value);
  }
  return total;
}

function valueFromDonationActions(row: MetaInsightRow): number {
  const values = row.action_values;
  if (!Array.isArray(values)) return 0;
  let total = 0;
  for (const action of values) {
    if (!action || typeof action !== "object") continue;
    const record = action as Record<string, unknown>;
    if (!isDonationActionType(asString(record.action_type))) continue;
    total += asNumber(record.value);
  }
  return total;
}

function reportedConversions(row: MetaInsightRow): number { return metricFromDonationActions(row); }
function reportedConversionValue(row: MetaInsightRow): number { return valueFromDonationActions(row); }

async function graphGetAll(path: string, token: string, proof: string | null, params: Record<string, string>): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  if (proof) url.searchParams.set("appsecret_proof", proof);
  let next: string | null = url.toString();
  while (next) {
    const pageUrl = new URL(next);
    if (proof && !pageUrl.searchParams.get("appsecret_proof")) pageUrl.searchParams.set("appsecret_proof", proof);
    const res = await fetch(pageUrl.toString(), { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { data?: MetaInsightRow[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message || `Meta API HTTP ${res.status}`);
    if (Array.isArray(data.data)) rows.push(...data.data);
    next = data.paging?.next ?? null;
  }
  return rows;
}

function fields(includeActions: boolean) {
  const list = ["date_start", "date_stop", "account_currency", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "objective", "impressions", "clicks", "spend", "ctr", "cpc", "cpm"];
  if (includeActions) list.push("actions", "action_values");
  return list.join(",");
}

function baseParams(dateFrom: Date, dateTo: Date, level: "campaign" | "adset" | "ad", includeActions: boolean) {
  const params: Record<string, string> = { time_increment: "1", time_range: JSON.stringify({ since: dateKey(dateFrom), until: dateKey(dateTo) }), level, limit: "500", fields: fields(includeActions) };
  if (includeActions) params.action_report_time = "conversion";
  return params;
}

function toCampaign(row: MetaInsightRow): SyncCampaignSnapshot | null {
  const campaignId = asString(row.campaign_id); const date = asString(row.date_start); if (!campaignId || !date) return null;
  return { date: dayStart(date), campaignId, campaignName: asString(row.campaign_name), objective: asString(row.objective), spend: asNumber(row.spend), impressions: Math.round(asNumber(row.impressions)), clicks: Math.round(asNumber(row.clicks)), ctr: asNumber(row.ctr) || null, cpc: asNumber(row.cpc) || null, cpm: asNumber(row.cpm) || null, reportedConversions: reportedConversions(row), reportedConversionValue: reportedConversionValue(row), currency: asString(row.account_currency), raw: row };
}

function toAdGroup(row: MetaInsightRow): SyncAdGroupSnapshot | null {
  const adGroupId = asString(row.adset_id); const date = asString(row.date_start); if (!adGroupId || !date) return null;
  return { date: dayStart(date), campaignId: asString(row.campaign_id), campaignName: asString(row.campaign_name), adGroupId, adGroupName: asString(row.adset_name), country: null, placement: null, spend: asNumber(row.spend), impressions: Math.round(asNumber(row.impressions)), clicks: Math.round(asNumber(row.clicks)), reportedConversions: 0, reportedConversionValue: 0, currency: asString(row.account_currency), raw: row };
}

function toAd(row: MetaInsightRow): SyncAdSnapshot | null {
  const adId = asString(row.ad_id); const date = asString(row.date_start); if (!adId || !date) return null;
  return { date: dayStart(date), campaignId: asString(row.campaign_id), campaignName: asString(row.campaign_name), adGroupId: asString(row.adset_id), adGroupName: asString(row.adset_name), adId, adName: asString(row.ad_name), country: null, placement: null, spend: asNumber(row.spend), impressions: Math.round(asNumber(row.impressions)), clicks: Math.round(asNumber(row.clicks)), reportedConversions: 0, reportedConversionValue: 0, currency: asString(row.account_currency), raw: row };
}

export const syncMeta: SyncClient = async ({ connection, dateFrom, dateTo }): Promise<SyncClientResult> => {
  const missing: string[] = [];
  if (!connection.accountId) missing.push("accountId");
  if (!connection.accessToken) missing.push("accessToken");
  if (missing.length > 0) return missingConfigResult(missing, "ناقص بيانات Meta — أكمل Ad Account ID و Access Token.");
  try {
    const account = cleanAccountId(connection.accountId!);
    const token = connection.accessToken!;
    const proof = proofForServerCalls(token, connection.appSecret);
    const campaignRows = await graphGetAll(`${account}/insights`, token, proof, baseParams(dateFrom, dateTo, "campaign", true));
    const adsetRows = await graphGetAll(`${account}/insights`, token, proof, baseParams(dateFrom, dateTo, "adset", false));
    const adRows = await graphGetAll(`${account}/insights`, token, proof, baseParams(dateFrom, dateTo, "ad", false));
    const campaigns = campaignRows.map(toCampaign).filter(Boolean) as SyncCampaignSnapshot[];
    const adGroups = adsetRows.map(toAdGroup).filter(Boolean) as SyncAdGroupSnapshot[];
    const ads = adRows.map(toAd).filter(Boolean) as SyncAdSnapshot[];
    const rowsFetched = campaigns.length + adGroups.length + ads.length;
    return { status: "SUCCESS", rowsFetched, message: `تمت مزامنة Meta Insights: ${campaigns.length} حملة، ${adGroups.length} مجموعة، ${ads.length} إعلان.`, snapshots: { campaigns, adGroups, ads } };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Meta API sync failed";
    const friendly = friendlyMetaError(raw);
    return { status: friendly.missing?.length ? "MISSING_CONFIG" : "FAILED", rowsFetched: 0, message: friendly.message, error: friendly.error, missingRequiredFields: friendly.missing };
  }
};
