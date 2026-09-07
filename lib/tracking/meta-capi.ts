/**
 * Shared Meta Conversions API sender.
 *
 * One canonical place to:
 *   1. Hash PII (SHA-256, lowercased+trimmed) per Meta's Advanced Matching spec.
 *   2. Build user_data + custom_data payloads.
 *   3. POST to the Graph events endpoint with strict pre-send validation.
 */

import crypto from "crypto";
import { getMetaCapiCredentialsFromSettings, type MetaCapiCredentials } from "@/lib/tracking/tracking-settings";

const FB_API_VERSION = "v21.0";
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_code?: string | null;
  external_id?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_ip?: string | null;
  client_ip_address?: string | null;
  user_agent?: string | null;
  subscription_id?: string | null;
}

export interface MetaContent {
  id: string;
  quantity?: number;
  item_price?: number;
}

export interface MetaCustomData {
  value?: number;
  currency?: string;
  content_ids?: string[];
  contents?: MetaContent[];
  num_items?: number;
  content_type?: string;
  content_name?: string;
  content_category?: string;
  description?: string;
  order_id?: string;
  status?: string;
  predicted_ltv?: number;
  [key: string]: unknown;
}

export interface MetaCapiEvent {
  event_name: string;
  event_id: string;
  event_time?: number;
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
  test_event_code?: string;
  action_source?: "website" | "email" | "app" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
}

export interface MetaCapiResult {
  ok: boolean;
  events_received?: number;
  fbtrace_id?: string;
  event_name?: string;
  event_id?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

function sha256(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return undefined;
  return crypto.createHash("sha256").update(normalised).digest("hex");
}

function hashPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return undefined;
  return crypto.createHash("sha256").update(digits).digest("hex");
}

function hashGender(gender: string | null | undefined): string | undefined {
  if (!gender) return undefined;
  const g = String(gender).trim().toLowerCase();
  const norm = g === "m" || g === "male" ? "m" : g === "f" || g === "female" ? "f" : undefined;
  if (!norm) return undefined;
  return crypto.createHash("sha256").update(norm).digest("hex");
}

function hashDob(dob: string | null | undefined): string | undefined {
  if (!dob) return undefined;
  const digits = String(dob).replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return crypto.createHash("sha256").update(digits.slice(0, 8)).digest("hex");
}

function hashCountry(cc: string | null | undefined): string | undefined {
  if (!cc) return undefined;
  const norm = String(cc).trim().toLowerCase();
  if (!norm) return undefined;
  return crypto.createHash("sha256").update(norm).digest("hex");
}

function normalizeClientIp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const first = String(value).split(",")[0]?.trim();
  if (!first) return undefined;
  const clean = first.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45);
  return clean || undefined;
}

export function buildMetaUserData(u: MetaUserData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const em = sha256(u.email);
  if (em) out.em = [em];
  const ph = hashPhone(u.phone);
  if (ph) out.ph = [ph];
  const fn = sha256(u.first_name);
  if (fn) out.fn = [fn];
  const ln = sha256(u.last_name);
  if (ln) out.ln = [ln];
  const ct = sha256(u.city);
  if (ct) out.ct = [ct];
  const st = sha256(u.state);
  if (st) out.st = [st];
  const zp = sha256(u.zip);
  if (zp) out.zp = [zp];
  const country = hashCountry(u.country_code);
  if (country) out.country = [country];
  const external_id = sha256(u.external_id);
  if (external_id) out.external_id = [external_id];
  const ge = hashGender(u.gender);
  if (ge) out.ge = [ge];
  const db = hashDob(u.date_of_birth);
  if (db) out.db = [db];
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.user_agent) out.client_user_agent = String(u.user_agent).slice(0, 512);
  const ip = normalizeClientIp(u.client_ip_address ?? u.client_ip);
  if (ip) out.client_ip_address = ip;
  if (u.subscription_id) out.subscription_id = u.subscription_id;
  return out;
}

/** Read Meta CAPI credentials from the same raw TrackingSettings document used by /dashboard/pixels. */
export async function getMetaCapiCredentials(): Promise<MetaCapiCredentials | null> {
  return getMetaCapiCredentialsFromSettings();
}

function validateEvent(event: MetaCapiEvent): string | null {
  if (!event.event_name) return "missing event_name";
  if (!event.event_id) return "missing event_id";
  const eventTime = event.event_time ?? Math.floor(Date.now() / 1000);
  const ageSeconds = Math.floor(Date.now() / 1000) - eventTime;
  if (ageSeconds > MAX_EVENT_AGE_SECONDS) return `event too old (${Math.floor(ageSeconds / 86400)}d) - Meta rejects > 7d`;
  if (eventTime > Math.floor(Date.now() / 1000) + 60) return "event_time is in the future";
  return null;
}

export async function sendMetaCapiEvent(event: MetaCapiEvent, creds?: MetaCapiCredentials): Promise<MetaCapiResult> {
  const c = creds ?? (await getMetaCapiCredentials());
  if (!c) return { skipped: true, ok: false, reason: "no credentials", event_name: event.event_name, event_id: event.event_id };

  const validationError = validateEvent(event);
  if (validationError) {
    console.warn("[Meta CAPI] rejected event:", event.event_name, event.event_id, validationError);
    return { ok: false, skipped: true, reason: validationError, event_name: event.event_name, event_id: event.event_id };
  }

  const user_data = buildMetaUserData(event.user_data);
  if (Object.keys(user_data).length === 0) {
    return { ok: false, skipped: true, reason: "no user identifiers", event_name: event.event_name, event_id: event.event_id };
  }

  const eventBlock: Record<string, unknown> = {
    event_name: event.event_name,
    event_time: event.event_time ?? Math.floor(Date.now() / 1000),
    event_id: event.event_id,
    action_source: event.action_source ?? "website",
    user_data,
  };
  if (event.event_source_url) eventBlock.event_source_url = event.event_source_url;
  if (event.custom_data && Object.keys(event.custom_data).length > 0) eventBlock.custom_data = event.custom_data;

  const payload: Record<string, unknown> = { data: [eventBlock] };
  if (event.test_event_code) payload.test_event_code = event.test_event_code;

  try {
    const res = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${c.pixelId}/events?access_token=${encodeURIComponent(c.accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { events_received?: number; fbtrace_id?: string; error?: { message?: string; type?: string; code?: number } };
    if (!res.ok) {
      console.error("[Meta CAPI]", event.event_name, event.event_id, `status=${res.status}`, "error:", data?.error?.message ?? "unknown", "fbtrace_id:", data?.fbtrace_id);
      return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}`, fbtrace_id: data?.fbtrace_id, event_name: event.event_name, event_id: event.event_id };
    }
    return { ok: true, events_received: data.events_received, fbtrace_id: data.fbtrace_id, event_name: event.event_name, event_id: event.event_id };
  } catch (error) {
    console.error("[Meta CAPI] network error", event.event_name, event.event_id, error);
    return { ok: false, error: error instanceof Error ? error.message : "unknown", event_name: event.event_name, event_id: event.event_id };
  }
}
