/**
 * Safe analytics dispatcher used by the engagement instrumentation layer.
 *
 * Every function here is null-safe: if Clarity / GA4 / GTM are blocked,
 * unloaded, or never initialised, calls are no-ops. Nothing in here ever
 * throws to the caller.
 *
 * Adds NO UI  only forwards events to whichever analytics globals exist.
 *
 * Targets, in order:
 *   1. Microsoft Clarity (`window.clarity`)  for session-recording filters.
 *   2. Google Analytics 4 (`window.gtag`)  for funnel reports.
 *   3. GTM dataLayer (`window.dataLayer`)  picked up by anything wired into GTM.
 */

import { isMeasurementHost, sanitizeEngagementData } from "./tracking/engagement-policy";
import { isPublicAnalyticsPath } from "./tracking/private-path";
import { hasMarketingConsent } from "./tracking/marketing-consent";

type AnyRecord = Record<string, unknown>;

/** Shared gate for this diagnostic layer; canonical conversion tracking is separate. */
export function isEngagementEnabled(): boolean {
  try {
    if (typeof window === "undefined" || !isMeasurementHost(window.location.hostname) ||
        !isPublicAnalyticsPath(window.location.pathname + window.location.search)) return false;
    // The diagnostic dispatcher must obey the same privacy rejection as the
    // automatic recorder. It must not identify a donor or push GTM data after
    // explicit analytics opt-out, even if previously initialized scripts remain.
    if (typeof navigator !== "undefined") {
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
      if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return false;
    }
    const cookie = typeof document === "undefined" ? "" : document.cookie || "";
    return hasMarketingConsent();
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
    // gtag, dataLayer already declared elsewhere (TrackingPixels.tsx)
  }
}

/** Tag the current Clarity session with key=value (filterable, smart segments). */
export function clarityTag(key: string, value: string | string[]): void {
  if (!isEngagementEnabled()) return;
  try {
    window.clarity?.("set", key, value);
  } catch {
    /* noop */
  }
}

/** Fire a custom Clarity event (filterable, alerts, smart segments). */
export function clarityEvent(name: string): void {
  if (!isEngagementEnabled()) return;
  try {
    window.clarity?.("event", name);
  } catch {
    /* noop */
  }
}

/**
 * Legacy compatibility shim. Never forward raw donor/user identifiers to a
 * third-party session recorder. A reviewed anonymous identity flow would
 * require explicit consent, minimization and security acceptance.
 */
export function clarityIdentify(
  _userId: string,
  _sessionId?: string,
  _pageId?: string,
  _friendlyName?: string
): void {
  // The signature remains compatible, but none of the caller-provided values
  // may be forwarded to a recorder or diagnostic provider.
  void [_userId, _sessionId, _pageId, _friendlyName];
}

/**
 * Pages where engagement events MUST NOT reach GTM. The Meta Pixel container
 * picks dataLayer pushes up as custom-event triggers and was firing standard
 * funnel events (PageView, AddPaymentInfo, SubscribedButtonClick, …) AGAIN on
 * /success  polluting the conversion column. The /success path owns Donate
 * exclusively (browser fbq + CAPI dedup'd by event_id); anything else fired
 * here is noise. Clarity + GA4 still record these events.
 */
const DATALAYER_BLOCKED_PATH_RE = /\/(success|donation-failed)(\/|$)/;

function isDataLayerBlockedPath(): boolean {
  try {
    return DATALAYER_BLOCKED_PATH_RE.test(window.location.pathname);
  } catch {
    return false;
  }
}

/**
 * Single dispatch entry point used by `EngagementInstrumentation`. Fans out to
 * Clarity (as event + tag), GA4, and the GTM dataLayer. Safe to call even when
 * all three are absent.
 *
 * On conversion landing pages (/success, /donation-failed) the GTM dataLayer
 * leg is suppressed  see `DATALAYER_BLOCKED_PATH_RE` for why.
 */
export function trackEngagement(name: string, data?: AnyRecord): void {
  if (!isEngagementEnabled()) return;

  // Sanitize before every destination, including session tags and debug output.
  const payload = sanitizeEngagementData(data);

  // Clarity custom tags receive only sanitized fields. Its automatic recorder is separate.
  clarityEvent(name);
  for (const [key, value] of Object.entries(payload)) clarityTag(key, String(value));

  // GA4  passthrough, doesn't throw if gtag is undefined.
  try {
    window.gtag?.("event", name, payload);
  } catch {
    /* noop */
  }

  // GTM dataLayer  anything bound to dataLayer in the user's GTM container
  // (e.g. Ads conversion tags) gets these too. Skipped on conversion pages so
  // Meta Pixel tags inside GTM can't keep mis-firing standard events on top
  // of the canonical Donate flow.
  if (!isDataLayerBlockedPath()) {
    try {
      if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ ...payload, event: name });
      }
    } catch {
      /* noop */
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", name, payload);
  }
}
