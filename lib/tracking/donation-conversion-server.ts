import { prisma } from "@/lib/prisma";
import {
  getMetaCapiCredentials,
  sendMetaCapiEvent,
  type MetaUserData,
  type MetaCustomData,
  type MetaContent,
  type MetaCapiResult,
} from "@/lib/tracking/meta-capi";
import { metaDonationEventId } from "@/lib/tracking/canonical";
import { pickAttributionForAudit, toTurkeyIso, writeConversionAudit } from "@/lib/tracking/conversion-audit";
import { recordConversionEvent, type ConversionEventStatus } from "@/lib/tracking/conversion-event-log";
import { getGa4ServerCredentialsFromSettings } from "@/lib/tracking/tracking-settings";
import { donationFieldEmpty } from "@/lib/donations/mongo-null";

type Attribution = Record<string, string>;
export type DonationConversionSyncOptions = { force?: boolean };

function getStr(j: unknown, k: string): string | undefined {
  if (!j || typeof j !== "object") return undefined;
  const v = (j as Record<string, unknown>)[k];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.length === 2 ? v.toUpperCase() : v;
}

async function loadDonationForConversion(donationId: string) {
  return prisma.donation.findUnique({
    where: { id: donationId },
    include: {
      donor: { select: { id: true, email: true, phone: true, name: true, countryCode: true, city: true, region: true, gender: true, birthdate: true } },
      items: { include: { campaign: { select: { id: true, title: true } } } },
      categoryItems: { include: { category: { select: { id: true, name: true } } } },
    },
  });
}

type LoadedDonation = NonNullable<Awaited<ReturnType<typeof loadDonationForConversion>>>;

function paidDonationValue(row: LoadedDonation): number {
  const total = Number(row.totalAmount ?? 0);
  if (Number.isFinite(total) && total > 0) return total;
  const amount = Number(row.amount ?? 0);
  const teamSupport = Number(row.teamSupport ?? 0);
  const fees = Number(row.fees ?? 0);
  const fallback = amount + teamSupport + fees;
  return Number.isFinite(fallback) ? fallback : 0;
}

function buildUserDataFromDonation(row: LoadedDonation): MetaUserData {
  const attribution = (row.attribution ?? undefined) as Attribution | undefined;
  const [first_name, ...rest] = (row.donor?.name ?? "").trim().split(/\s+/);
  const last_name = rest.join(" ") || undefined;
  return {
    external_id: row.donor?.id ?? null,
    email: row.donor?.email ?? null,
    phone: row.donor?.phone ?? null,
    first_name: first_name || null,
    last_name: last_name || null,
    city: row.donor?.city ?? getStr(attribution, "city") ?? null,
    state: row.donor?.region ?? getStr(attribution, "state") ?? getStr(attribution, "region") ?? null,
    zip: getStr(attribution, "zip") ?? getStr(attribution, "postal_code") ?? null,
    country_code: normalizeCountryCode(row.donor?.countryCode) ?? normalizeCountryCode(row.donorCountryCode) ?? normalizeCountryCode(getStr(attribution, "country_code")) ?? normalizeCountryCode(getStr(attribution, "country")) ?? null,
    gender: row.donor?.gender ?? null,
    date_of_birth: row.donor?.birthdate ?? null,
    fbp: getStr(attribution, "fbp") ?? null,
    fbc: getStr(attribution, "fbc") ?? null,
    client_ip: getStr(attribution, "client_ip") ?? getStr(attribution, "client_ip_address") ?? null,
    user_agent: getStr(attribution, "user_agent") ?? null,
    subscription_id: row.subscriptionId ?? null,
  };
}

function buildContents(row: LoadedDonation) {
  const ids: string[] = [];
  const contents: MetaContent[] = [];
  for (const it of row.items) { ids.push(it.campaignId); contents.push({ id: it.campaignId, quantity: 1, item_price: it.amount }); }
  for (const ci of row.categoryItems) { ids.push(ci.categoryId); contents.push({ id: ci.categoryId, quantity: 1, item_price: ci.amount }); }
  if (row.teamSupport > 0) { ids.push("team_support"); contents.push({ id: "team_support", quantity: 1, item_price: row.teamSupport }); }
  if (row.fees > 0) { ids.push("covered_fees"); contents.push({ id: "covered_fees", quantity: 1, item_price: row.fees }); }
  if (ids.length === 0) { ids.push("donation"); contents.push({ id: "donation", quantity: 1, item_price: paidDonationValue(row) }); }
  return { ids, contents };
}

function primaryContentName(row: LoadedDonation): string {
  return row.items[0]?.campaign?.title ?? row.categoryItems[0]?.category?.name ?? "Donation";
}

function auditMetaPayload(row: LoadedDonation, eventId: string, customData: MetaCustomData) {
  return { event_name: "Donate", event_id: eventId, donation_id: row.id, amount: row.amount, team_support: row.teamSupport, fees: row.fees, amount_usd: row.amountUSD, total_amount: row.totalAmount, currency: row.currency, provider: row.provider, created_at_utc: row.createdAt.toISOString(), created_at_turkey: toTurkeyIso(row.createdAt), paid_at_utc: row.paidAt?.toISOString() ?? null, paid_at_turkey: toTurkeyIso(row.paidAt), reporting_timezone: "Europe/Istanbul", payment_provider_timezone: "America/Toronto", custom_data: customData, attribution: pickAttributionForAudit(row.attribution) };
}

function metaStatus(result: MetaCapiResult): ConversionEventStatus {
  if (result.ok) return "SENT";
  if (result.skipped) return "SKIPPED";
  return "FAILED";
}

export async function sendDonationServerConversions(donationId: string, options: DonationConversionSyncOptions = {}): Promise<MetaCapiResult> {
  try {
    const row = await loadDonationForConversion(donationId);
    if (!row) return { ok: false, skipped: true, reason: "donation not found" };
    if (row.status !== "PAID") return { ok: false, skipped: true, reason: `status=${row.status}` };
    if (row.paidAt == null) return { ok: false, skipped: true, reason: "paidAt unset" };
    if (!options.force && row.conversionEventsSentAt != null) return { ok: false, skipped: true, reason: "already sent" };

    const amount = paidDonationValue(row);
    if (!(amount > 0)) return { ok: false, skipped: true, reason: "amount <= 0" };

    const creds = await getMetaCapiCredentials();
    const attribution = (row.attribution ?? undefined) as Attribution | undefined;
    const eventSourceUrl = getStr(attribution, "landing_page");
    const eventTime = Math.floor((row.paidAt ?? new Date()).getTime() / 1000);
    const currency = row.currency || "USD";
    const contentName = primaryContentName(row);
    const { ids, contents } = buildContents(row);
    const eventId = metaDonationEventId(row.id, "success");
    const custom_data: MetaCustomData = { value: amount, currency, content_type: "donation", content_name: contentName, content_category: row.subscriptionId ? "monthly" : "donation", content_ids: ids, contents, num_items: contents.reduce((s, c) => s + (c.quantity ?? 1), 0), order_id: row.id, transaction_id: row.id, status: "paid", success: true, payment_info_available: 1, donation_type: row.subscriptionId ? "MONTHLY" : "ONE_TIME", recurring: !!row.subscriptionId, payment_method: (row.paymentMethod ?? "CARD").toLowerCase() };

    await writeConversionAudit({ donationId: row.id, eventId, stage: options.force ? "meta_capi_retry_attempt" : "meta_capi_attempt", message: options.force ? "Meta CAPI Donate retry attempted" : "Meta CAPI Donate send attempted", metadata: auditMetaPayload(row, eventId, custom_data) });
    let metaResult: MetaCapiResult = { ok: false, skipped: true, reason: "no creds" };
    if (creds) metaResult = await sendMetaCapiEvent({ event_name: "Donate", event_id: eventId, event_time: eventTime, event_source_url: eventSourceUrl, action_source: "website", user_data: buildUserDataFromDonation(row), custom_data }, creds);

    await recordConversionEvent({ donationId: row.id, eventId, eventName: "Donate", platform: "META", channel: "server", status: metaStatus(metaResult), dedupKey: eventId, value: amount, currency, error: metaResult.error ?? metaResult.reason ?? null, request: auditMetaPayload(row, eventId, custom_data), response: metaResult, sentAt: metaResult.ok ? new Date(eventTime * 1000) : null });
    await writeConversionAudit({ donationId: row.id, eventId, stage: options.force ? "meta_capi_retry_result" : "meta_capi_result", message: metaResult.ok ? "Meta CAPI Donate send succeeded" : "Meta CAPI Donate send did not succeed", metadata: { ...auditMetaPayload(row, eventId, custom_data), meta_result: metaResult } });
    if (metaResult.ok) {
      await prisma.donation.update({ where: { id: row.id }, data: { conversionEventsSentAt: new Date() } });
    }
    await sendGa4Purchase(row, amount, currency, contentName, eventTime, eventId);

    if (!metaResult.ok && !metaResult.skipped) console.error("[conversion] Donate send failed and donation was not marked sent:", row.id, metaResult.error, metaResult.fbtrace_id);
    return metaResult;
  } catch (e) {
    console.error("[conversion] sendDonationServerConversions", donationId, e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function sendDonationFailedConversions(donationId: string, options: DonationConversionSyncOptions = {}): Promise<MetaCapiResult> {
  try {
    const row = await loadDonationForConversion(donationId);
    if (!row) return { ok: false, skipped: true, reason: "donation not found" };
    if (row.status !== "FAILED") return { ok: false, skipped: true, reason: `status=${row.status}` };
    if (row.paidAt != null) return { ok: false, skipped: true, reason: "donation later succeeded" };
    if (!options.force && row.conversionFailedEventsSentAt != null) return { ok: false, skipped: true, reason: "already sent" };

    if (!options.force) {
      // `paidAt` and `conversionFailedEventsSentAt` are ABSENT (not null) on almost every row,
      // and Prisma's `{ field: null }` does not match an absent field on MongoDB. This claim
      // therefore matched 0 of 212 failed donations — DonateFailed has never actually fired.
      const claim = await prisma.donation.updateMany({
        where: {
          AND: [
            { id: row.id, status: "FAILED" },
            donationFieldEmpty("paidAt"),
            donationFieldEmpty("conversionFailedEventsSentAt"),
          ],
        },
        data: { conversionFailedEventsSentAt: new Date() },
      });
      if (claim.count === 0) return { ok: false, skipped: true, reason: "lost idempotency claim" };
    }

    const amount = paidDonationValue(row);
    const currency = row.currency || "USD";
    const failedEventId = metaDonationEventId(row.id, "failed");
    const creds = await getMetaCapiCredentials();
    if (!creds) {
      await recordConversionEvent({ donationId: row.id, eventId: failedEventId, eventName: "DonateFailed", platform: "META", channel: "server", status: "SKIPPED", dedupKey: failedEventId, value: amount, currency, error: "no credentials" });
      return { ok: false, skipped: true, reason: "no credentials" };
    }

    const attribution = (row.attribution ?? undefined) as Attribution | undefined;
    const eventSourceUrl = getStr(attribution, "landing_page");
    const eventTime = Math.floor(((row as { updatedAt?: Date }).updatedAt ?? row.createdAt ?? new Date()).getTime() / 1000);
    const contentName = primaryContentName(row);
    const { ids, contents } = buildContents(row);
    const custom_data: MetaCustomData = { value: amount, currency, content_type: "product", content_name: contentName, content_category: row.subscriptionId ? "monthly" : "donation", content_ids: ids, contents, num_items: contents.reduce((s, c) => s + (c.quantity ?? 1), 0), order_id: row.id, status: "failed", donation_type: row.subscriptionId ? "MONTHLY" : "ONE_TIME", recurring: !!row.subscriptionId, payment_info_available: 1, failure_reason: row.providerErrorMessage ?? row.providerTxnResult ?? undefined, provider: row.provider ?? undefined };

    const metaResult = await sendMetaCapiEvent({ event_name: "DonateFailed", event_id: failedEventId, event_time: eventTime, event_source_url: eventSourceUrl, user_data: buildUserDataFromDonation(row), custom_data }, creds);
    await recordConversionEvent({ donationId: row.id, eventId: failedEventId, eventName: "DonateFailed", platform: "META", channel: "server", status: metaStatus(metaResult), dedupKey: failedEventId, value: amount, currency, error: metaResult.error ?? metaResult.reason ?? null, request: { event_name: "DonateFailed", event_id: failedEventId, custom_data }, response: metaResult, sentAt: metaResult.ok ? new Date(eventTime * 1000) : null });
    if (metaResult.ok) await prisma.donation.update({ where: { id: row.id }, data: { conversionFailedEventsSentAt: new Date() } });
    if (!metaResult.ok && !metaResult.skipped) console.error("[conversion] DonateFailed send failed but claim retained:", row.id, metaResult.error, metaResult.fbtrace_id);
    return metaResult;
  } catch (e) {
    console.error("[conversion] sendDonationFailedConversions", donationId, e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function syncDonationConversion(donationId: string, options: DonationConversionSyncOptions = {}): Promise<MetaCapiResult> {
  const row = await prisma.donation.findUnique({ where: { id: donationId }, select: { id: true, status: true, paidAt: true } });
  if (!row) return { ok: false, skipped: true, reason: "donation not found" };
  if (row.status === "PAID" && row.paidAt != null) return sendDonationServerConversions(donationId, options);
  if (row.status === "FAILED" && row.paidAt == null) return sendDonationFailedConversions(donationId, options);
  return { ok: false, skipped: true, reason: `no terminal state (status=${row.status})` };
}

async function sendGa4Purchase(row: LoadedDonation, amount: number, currency: string, contentName: string, eventTime: number, eventId: string): Promise<void> {
  const { measurementId: gaMeasurementId, apiSecret: gaApiSecret } = await getGa4ServerCredentialsFromSettings();
  if (!gaMeasurementId || !gaApiSecret) {
    await recordConversionEvent({ donationId: row.id, eventId, eventName: "purchase", platform: "GA4", channel: "server", status: "SKIPPED", dedupKey: eventId, value: amount, currency, error: "missing GA4 measurement id or API secret" });
    return;
  }

  const attribution = (row.attribution ?? undefined) as Attribution | undefined;
  const gaClientId = getStr(attribution, "ga_client_id") || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`;
  const sessionIdRaw = getStr(attribution, "ga_session_id");
  const sessionNum = sessionIdRaw ? parseInt(sessionIdRaw.replace(/\D/g, "").slice(0, 12), 10) : undefined;
  const items = row.items.map((it) => ({ item_id: it.campaignId, item_name: it.campaign?.title ?? "Donation", item_category: "donation", price: it.amount, quantity: 1 }));
  for (const ci of row.categoryItems) items.push({ item_id: ci.categoryId, item_name: ci.category?.name ?? "Category", item_category: "donation", price: ci.amount, quantity: 1 });
  if (row.teamSupport > 0) items.push({ item_id: "team_support", item_name: "Team Support", item_category: "team_support", price: row.teamSupport, quantity: 1 });
  if (row.fees > 0) items.push({ item_id: "covered_fees", item_name: "Covered Fees", item_category: "fees", price: row.fees, quantity: 1 });
  if (items.length === 0) items.push({ item_id: "donation", item_name: contentName, item_category: "donation", price: amount, quantity: 1 });
  const gaPayload = { client_id: gaClientId, events: [{ name: "purchase", params: { transaction_id: row.id, value: amount, currency, engagement_time_msec: 100, affiliation: "Donation Website", event_time: eventTime, event_id: eventId, ...(sessionNum != null && !Number.isNaN(sessionNum) ? { session_id: sessionNum } : {}), items } }] };

  try {
    const gaUrl = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(gaMeasurementId)}&api_secret=${encodeURIComponent(gaApiSecret)}`;
    const res = await fetch(gaUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gaPayload) });
    const errorText = res.ok ? "" : await res.text();
    await recordConversionEvent({ donationId: row.id, eventId, eventName: "purchase", platform: "GA4", channel: "server", status: res.ok ? "SENT" : "FAILED", dedupKey: eventId, value: amount, currency, error: res.ok ? null : errorText, request: gaPayload, response: { status: res.status, ok: res.ok, body: errorText.slice(0, 500) }, sentAt: res.ok ? new Date(eventTime * 1000) : null });
    if (!res.ok) console.error("[conversion] GA4 MP error", errorText);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    await recordConversionEvent({ donationId: row.id, eventId, eventName: "purchase", platform: "GA4", channel: "server", status: "FAILED", dedupKey: eventId, value: amount, currency, error: message, request: gaPayload });
    console.error("[conversion] GA4 MP fetch failed", e);
  }
}
