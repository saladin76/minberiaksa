/**
 * POST /api/track
 *
 * Generic server-side mirror for browser canonical funnel events.
 * Paid/failed donation conversions remain owned by dedicated endpoints to avoid
 * double counting. This route enriches safe funnel events with normalized
 * attribution context for better matching and diagnostics.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import type { CanonicalEvent } from "@/lib/tracking/canonical";
import {
  META_EVENT_MAP,
  META_CAPI_OFF_CHANNEL,
  TIKTOK_EVENT_MAP,
  GA4_EVENT_MAP,
} from "@/lib/tracking/canonical";
import {
  sendMetaCapiEvent,
  type MetaUserData,
  type MetaCustomData,
} from "@/lib/tracking/meta-capi";
import { getRawTrackingSettings, trackingString } from "@/lib/tracking/tracking-settings";

const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

function sha256(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return undefined;
  return crypto.createHash("sha256").update(normalised).digest("hex");
}

function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "string" && value.trim()) target[key] = value.trim();
  else if (typeof value === "number" && Number.isFinite(value)) target[key] = value;
  else if (typeof value === "boolean") target[key] = value;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] == null || obj[key] === "") delete obj[key];
  }
  return obj;
}

function attributionParams(event: CanonicalEvent): Record<string, unknown> {
  const s = event.session ?? {};
  const p = event.page ?? {};
  const out: Record<string, unknown> = {};
  const pairs: Array<[string, unknown]> = [
    ["session_id", s.session_id],
    ["client_id", s.client_id],
    ["utm_source", s.source],
    ["utm_medium", s.medium],
    ["utm_campaign", s.campaign],
    ["utm_content", s.content],
    ["utm_term", s.term],
    ["campaign_id", s.campaign_id],
    ["campaign_name", s.campaign_name],
    ["adset_id", s.adset_id],
    ["adset_name", s.adset_name],
    ["ad_group_id", s.ad_group_id],
    ["ad_group_name", s.ad_group_name],
    ["ad_id", s.ad_id],
    ["ad_name", s.ad_name],
    ["creative_id", s.creative_id],
    ["creative_name", s.creative_name],
    ["placement", s.placement],
    ["publisher_platform", s.publisher_platform],
    ["site_source_name", s.site_source_name],
    ["platform", s.platform],
    ["device", s.device],
    ["device_platform", s.device_platform],
    ["network", s.network],
    ["matchtype", s.matchtype],
    ["keyword", s.keyword],
    ["target_id", s.target_id],
    ["loc_interest", s.loc_interest],
    ["loc_physical", s.loc_physical],
    ["audience_type", s.audience_type],
    ["audience_segment", s.audience_segment],
    ["message_variant", s.message_variant],
    ["channel", s.channel],
    ["twilio_campaign_id", s.twilio_campaign_id],
    ["twilio_template_id", s.twilio_template_id],
    ["target_country", s.target_country],
    ["target_region", s.target_region],
    ["language", s.language ?? p.language ?? p.locale],
    ["locale", s.locale ?? p.locale],
    ["currency", s.currency],
    ["funnel", s.funnel],
    ["objective", s.objective],
    ["fbclid", s.fbclid],
    ["gclid", s.gclid],
    ["gbraid", s.gbraid],
    ["wbraid", s.wbraid],
    ["ttclid", s.ttclid],
    ["twclid", s.twclid],
    ["ga_client_id", s.ga_client_id],
    ["ga_session_id", s.ga_session_id],
  ];
  for (const [key, value] of pairs) assignIfPresent(out, key, value);
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as CanonicalEvent;
    if (!event?.event) {
      return NextResponse.json({ ok: false, reason: "missing event" }, { status: 400 });
    }

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined;

    const row = await getRawTrackingSettings();
    const facebookPixelId = trackingString(row, "facebookPixelId") || trackingString(row, "metaPixelId");
    const facebookAccessToken = trackingString(row, "facebookAccessToken") || trackingString(row, "metaAccessToken");
    const tiktokPixelId = trackingString(row, "tiktokPixelId");
    const tiktokAccessToken = trackingString(row, "tiktokAccessToken");
    const gaMeasurementId = trackingString(row, "gaMeasurementId");
    const results: Record<string, unknown> = {};

    if (facebookPixelId && facebookAccessToken) {
      if (META_CAPI_OFF_CHANNEL.has(event.event)) {
        console.warn("[/api/track] refused off-channel event:", event.event, "event_id=", event.event_id);
        results.meta = { skipped: true, owner: "dedicated-endpoint" };
      } else {
        results.meta = await mirrorMetaCanonical(event, facebookPixelId, facebookAccessToken, clientIp);
      }
    }

    if (tiktokPixelId && tiktokAccessToken) {
      results.tiktok = await sendTikTokEvents(event, tiktokPixelId, tiktokAccessToken, clientIp);
    }

    if (gaMeasurementId) {
      results.ga4 = await sendGa4BrowserMirror(event, gaMeasurementId);
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[/api/track] error:", err);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 200 });
  }
}

async function mirrorMetaCanonical(
  event: CanonicalEvent,
  pixelId: string,
  accessToken: string,
  clientIp?: string
) {
  const metaEventName = META_EVENT_MAP[event.event];
  if (!metaEventName) return { skipped: true };

  const u = event.user ?? {};
  const d = event.donation ?? {};
  const p = event.payment ?? {};

  const user_data: MetaUserData = {
    email: u.email ?? null,
    phone: u.phone ?? null,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
    city: u.city ?? null,
    state: u.state ?? null,
    zip: u.zip ?? null,
    country_code: u.country_code ?? null,
    external_id: u.external_id ?? null,
    gender: u.gender ?? null,
    date_of_birth: u.date_of_birth ?? null,
    fbp: u.fbp ?? event.session?.fbp ?? null,
    fbc: u.fbc ?? event.session?.fbc ?? null,
    client_ip: clientIp ?? u.ip ?? null,
    user_agent: u.user_agent ?? null,
    subscription_id: u.subscription_id ?? null,
  };

  const custom_data: MetaCustomData = {};
  if (d.amount != null) custom_data.value = d.amount;
  if (d.currency) custom_data.currency = d.currency;
  if (event.items?.length) {
    custom_data.content_ids = event.items.map((i) => i.item_id);
    custom_data.contents = event.items.map((i) => ({
      id: i.item_id,
      quantity: i.quantity ?? 1,
      item_price: i.price ?? 0,
    }));
    custom_data.num_items = event.items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  } else if (d.cause_id) {
    custom_data.content_ids = [d.cause_id];
    custom_data.contents = [{ id: d.cause_id, quantity: 1, item_price: d.amount ?? d.amount_usd ?? 0 }];
    custom_data.num_items = 1;
  }
  custom_data.content_type = "product";
  if (d.content_name ?? d.cause_name) custom_data.content_name = d.content_name ?? d.cause_name;
  if (d.content_category ?? d.donation_type) custom_data.content_category = d.content_category ?? d.donation_type?.toLowerCase();
  if (d.description) custom_data.description = d.description;
  if (d.status) custom_data.status = d.status;
  if (d.payment_info_available != null) custom_data.payment_info_available = d.payment_info_available;
  if (d.predicted_ltv != null) custom_data.predicted_ltv = d.predicted_ltv;
  if (p.transaction_id) custom_data.order_id = p.transaction_id;
  Object.assign(custom_data, attributionParams(event));

  return sendMetaCapiEvent(
    {
      event_name: metaEventName,
      event_id: event.event_id,
      event_time: event.event_time,
      event_source_url: event.page?.url,
      user_data,
      custom_data,
    },
    { pixelId, accessToken }
  );
}

async function sendTikTokEvents(
  event: CanonicalEvent,
  pixelCode: string,
  accessToken: string,
  clientIp?: string
) {
  const tiktokEventName = TIKTOK_EVENT_MAP[event.event];
  if (!tiktokEventName) return { skipped: true };

  const u = event.user ?? {};
  const d = event.donation ?? {};
  const p = event.payment ?? {};
  const attribution = attributionParams(event);

  const payload = {
    pixel_code: pixelCode,
    event: tiktokEventName,
    event_id: event.event_id,
    timestamp: new Date(event.event_time * 1000).toISOString(),
    context: compact({
      page: compact({
        url: event.page?.url,
        referrer: event.page?.referrer,
      }),
      user: compact({
        external_id: u.external_id ? sha256(u.external_id) : undefined,
        email: u.email ? sha256(u.email) : undefined,
        phone_number: u.phone ? sha256(u.phone) : undefined,
        ttclid: event.session?.ttclid,
        ip: clientIp,
        user_agent: u.user_agent,
      }),
    }),
    properties: compact({
      value: d.amount_usd ?? d.amount,
      currency: d.currency,
      content_id: event.items?.[0]?.item_id ?? d.cause_id ?? p.transaction_id,
      content_ids: event.items?.map((i) => i.item_id),
      content_name: d.cause_name ?? event.items?.[0]?.item_name,
      content_type: "product",
      order_id: p.transaction_id,
      quantity: event.items?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 1,
      ...attribution,
    }),
  };

  try {
    const res = await fetch(TIKTOK_EVENTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.code !== 0) {
      console.error("[TikTok Events] error:", data?.message);
      return { ok: false, error: data?.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("[TikTok Events] fetch failed:", e);
    return { ok: false, error: "fetch failed" };
  }
}

async function sendGa4BrowserMirror(event: CanonicalEvent, measurementId: string) {
  const ga4EventName = GA4_EVENT_MAP[event.event];
  if (!ga4EventName) return { skipped: true };
  // This route does not hold GA4 API secret in Prisma Client yet; browser gtag
  // remains the primary client-side GA4 path. Returning readiness metadata here
  // keeps diagnostics explicit without sending duplicate MP events.
  return {
    skipped: true,
    reason: "browser-gtag-owned",
    measurementId: measurementId ? "configured" : "missing",
  };
}
