"use client";

import { DONATION_ATTRIBUTION_KEYS, safeAttributionUrl, isPaymentReturnPage, type DonationAttributionKey } from "./sanitize";
import { currentGa4SessionIdFromCookies } from "./ga4-session-cookie";
import { captureStoredClickIds, clearStoredClickIds } from "@/lib/tracking/click-id-storage";

const PREFIX = "ala_attr_";
const MAX_AGE_DAYS = 30;
const SESSION_KEY = "ala_tracking_session_id";
const FBCLID_SESSION_KEY = "ala_fbclid";

function setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + MAX_AGE_DAYS * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
}

function setRawCookie(name: string, value: string, overwrite = true) {
  if (!overwrite && getRawCookie(name)) return;
  const expires = new Date(Date.now() + MAX_AGE_DAYS * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
}

function getCookie(name: string): string | undefined {
  const hit = document.cookie.split("; ").find((row) => row.startsWith(`${encodeURIComponent(name)}=`));
  if (!hit) return undefined;
  try { return decodeURIComponent(hit.split("=").slice(1).join("=")); } catch { return undefined; }
}

function getRawCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!hit) return undefined;
  try { return decodeURIComponent(hit.split("=").slice(1).join("=")); } catch { return undefined; }
}

function getOrCreateSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch { return undefined; }
}

function sessionGet(key: string): string | undefined {
  try { return sessionStorage.getItem(key) || undefined; } catch { return undefined; }
}

function sessionSet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch {}
}

function hasMacro(value: string): boolean {
  return value.includes("{{") || value.includes("}}") || value.includes("__CAMPAIGN_") || value.includes("__ADGROUP_") || value.includes("__AD_");
}

function setIfClean(key: DonationAttributionKey, value: string | null | undefined, overwrite = true) {
  const v = value?.trim();
  if (!v) return;
  if (hasMacro(v)) {
    setCookie(PREFIX + `${key}_unresolved`, "true");
    return;
  }
  if (!overwrite && getCookie(PREFIX + key)) return;
  setCookie(PREFIX + key, v.slice(0, 2048));
}

function getOrCreateFbp(): string | undefined {
  const existing = getRawCookie("_fbp");
  if (existing) return existing;
  const generated = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
  setRawCookie("_fbp", generated, false);
  return generated;
}

function buildFbc(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}

function persistMetaClickIds(params: URLSearchParams) {
  const fromUrl = params.get("fbclid");
  const storedFbclid = sessionGet(FBCLID_SESSION_KEY) || getCookie(PREFIX + "fbclid");
  const fbclid = fromUrl && !hasMacro(fromUrl) ? fromUrl : storedFbclid;

  if (fbclid && !hasMacro(fbclid)) {
    sessionSet(FBCLID_SESSION_KEY, fbclid);
    setIfClean("fbclid", fbclid, Boolean(fromUrl));
    const existingFbc = getRawCookie("_fbc") || getCookie(PREFIX + "fbc");
    const fbc = fromUrl && !existingFbc?.endsWith(`.${fbclid}`) ? buildFbc(fbclid) : existingFbc || buildFbc(fbclid);
    setRawCookie("_fbc", fbc, Boolean(fromUrl));
    setIfClean("fbc", fbc, Boolean(fromUrl));
  }

  const fbp = getOrCreateFbp();
  if (fbp) setIfClean("fbp", fbp, false);
}

/** Capture URL params + click IDs into cookies (call once on app load / route change). */
export function captureAttributionFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const [key,value] of Array.from(params)) {
    const lower=key.toLowerCase(), canonical=["sccid","sc_click_id"].includes(lower)?"scclid":lower;
    if (!params.has(canonical)) params.set(canonical,value);
  }
  const identityKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "campaign_id", "fbclid", "gclid", "gbraid", "wbraid", "dclid", "ttclid", "twclid", "scclid", "li_fat_id", "rdt_cid"] as const;
  const newTouch = identityKeys.some(key => { const value = params.get(key)?.trim(); return value && !hasMacro(value) && value !== getCookie(PREFIX + key); });
  if (newTouch) {
    const persistent=new Set(["first_landing_page","first_referrer","session_id","fbp","_ga","ga_client_id","ga_session_id"]);
    for (const key of [...DONATION_ATTRIBUTION_KEYS,"twilioCampaignId","twilioTemplateId"].filter(key=>!persistent.has(key))) {
      for (const suffix of ["", "_unresolved"]) document.cookie = `${encodeURIComponent(PREFIX + key + suffix)}=; Max-Age=0; path=/; SameSite=Lax; Secure`;
    }
    clearStoredClickIds();
    try { sessionStorage.removeItem(FBCLID_SESSION_KEY); } catch {}
  }
  const storedClickIds = captureStoredClickIds();
  if (newTouch || !getCookie(PREFIX + "source_captured_at")) {
    setIfClean("source_captured_at", new Date().toISOString(), true);
    setIfClean("source_capture", newTouch ? "campaign" : document.referrer ? "referrer" : "direct", true);
  }

  const keys: DonationAttributionKey[] = [...DONATION_ATTRIBUTION_KEYS];
  for (const key of keys) {
    const fromUrl = params.get(key) || storedClickIds[key as keyof typeof storedClickIds];
    if (fromUrl) setIfClean(key, fromUrl, true);
  }

  const currentUrl = safeAttributionUrl(window.location.href);
  const isReturn = isPaymentReturnPage(currentUrl);
  // Gateway success/failure screens are conversion destinations, not original
  // acquisition landings. Never write the guest receipt token to cookies.
  if (currentUrl && !isReturn) {
    setIfClean("first_landing_page", currentUrl, false);
    setIfClean("landing_page", currentUrl, newTouch);
  }
  const safeReferrer = safeAttributionUrl(document.referrer);
  if (safeReferrer && !isPaymentReturnPage(safeReferrer)) {
    setIfClean("first_referrer", safeReferrer, false);
    setIfClean("referrer", safeReferrer, newTouch);
  }

  const sessionId = getOrCreateSessionId();
  if (sessionId) setIfClean("session_id", sessionId, false);

  persistMetaClickIds(params);

  const ga = getRawCookie("_ga");
  if (ga) {
    setIfClean("_ga", ga, false);
    const m = ga.match(/^GA\d\.\d\.(.+)$/);
    if (m) setIfClean("ga_client_id", m[1], false);
  }
}

/**
 * Build the attribution payload persisted onto the donation row at create time.
 * It merges stored UTM/click cookies, real browser IDs, current conversion URL,
 * and a stable session id. Values with unresolved ad macros are omitted and
 * flagged by the server sanitizer so they do not poison reporting.
 */
export function getDonationAttributionPayload(): Record<string, string> {
  if (typeof document === "undefined") return {};
  captureAttributionFromUrl();
  const out: Record<string, string> = {};
  for (const key of DONATION_ATTRIBUTION_KEYS) {
    const v = getCookie(PREFIX + key);
    if (v) out[key] = v;
  }

  const currentUrl = safeAttributionUrl(window.location.href);
  if (currentUrl) out.conversion_page = currentUrl;
  // If attribution was first captured on a bank return, do not fabricate a
  // landing_page from /success, or store its private query token.
  if (!out.landing_page && currentUrl && !isPaymentReturnPage(currentUrl)) out.landing_page = currentUrl;
  out.first_landing_page = out.first_landing_page || out.landing_page;
  const safeReferrer = safeAttributionUrl(document.referrer);
  if (!out.referrer && safeReferrer && !isPaymentReturnPage(safeReferrer)) out.referrer = safeReferrer;

  const sessionId = getOrCreateSessionId();
  if (sessionId) out.session_id = out.session_id || sessionId;

  if (!out.fbclid) {
    const fbclid = sessionGet(FBCLID_SESSION_KEY);
    if (fbclid) out.fbclid = fbclid;
  }
  if (!out.fbp) {
    const fbp = getRawCookie("_fbp") || getOrCreateFbp();
    if (fbp) out.fbp = fbp;
  }
  if (!out.fbc) {
    const fbc = getRawCookie("_fbc") || (out.fbclid ? buildFbc(out.fbclid) : undefined);
    if (fbc) {
      out.fbc = fbc;
      setRawCookie("_fbc", fbc, false);
      setIfClean("fbc", fbc, false);
    }
  }
  if (!out.ga_client_id) {
    const ga = getRawCookie("_ga");
    if (ga) {
      out._ga = out._ga || ga;
      const m = ga.match(/^GA\d\.\d\.(.+)$/);
      if (m) out.ga_client_id = m[1];
    }
  }

  // Read only the active GA4 session from browser cookies, not the application's
  // separate session_id. Never persist it in a 30-day attribution cookie.
  // Respect explicit analytics denial, GPC and DNT.
  const gaSessionId = currentGa4SessionIdFromCookies(
    document.cookie,
    typeof navigator !== "undefined" ? navigator : undefined
  );
  if (gaSessionId) out.ga_session_id = gaSessionId;
  else delete out.ga_session_id;

  return out;
}
