/**
 * Explicit, revocable browser consent for OPTIONAL marketing analytics only.
 * Checkout, payment initiation, receipts and donor authentication MUST NOT depend
 * on this decision. Missing/invalid cookie means no marketing consent.
 */
export const MARKETING_CONSENT_COOKIE = "analytics_consent";
export const MARKETING_CONSENT_EVENT = "analytics-consent-changed";
export type MarketingConsent = "granted" | "denied" | "missing";

function findCookie(name: string, raw: string): string | undefined {
  const item = raw.split(";").map(value => value.trim())
    .find(value => value.startsWith(name + "="));
  if (!item) return undefined;
  try { return decodeURIComponent(item.slice(name.length + 1)).toLowerCase(); }
  catch { return undefined; }
}

export function readMarketingConsent(
  cookie: string = typeof document === "undefined" ? "" : document.cookie,
  nav: Pick<Navigator, "doNotTrack"> & { globalPrivacyControl?: boolean } | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
): MarketingConsent {
  try {
    if (nav?.globalPrivacyControl === true || nav?.doNotTrack === "1") return "denied";
    const current = findCookie(MARKETING_CONSENT_COOKIE, cookie);
    const older = findCookie("tracking_consent", cookie);
    if (current === "denied" || current === "rejected" || current === "false" || current === "0") return "denied";
    if (older === "denied" || older === "rejected" || older === "false" || older === "0") return "denied";
    if (current === "granted" || current === "accepted" || current === "true" || current === "1") return "granted";
    if (older === "granted" || older === "accepted" || older === "true" || older === "1") return "granted";
    return "missing";
  } catch {
    return "denied";
  }
}

export function hasMarketingConsent(): boolean {
  return readMarketingConsent() === "granted";
}

/** Only a deliberate preference button may call this function. */
export function setMarketingConsent(granted: boolean): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const allowed = granted && !(
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
    navigator.doNotTrack === "1"
  );
  const choice = allowed ? "granted" : "denied";
  const suffix = "; Path=/; Max-Age=15552000; SameSite=Lax" +
    (window.location.protocol === "https:" ? "; Secure" : "");
  document.cookie = MARKETING_CONSENT_COOKIE + "=" + choice + suffix;
  document.cookie = "tracking_consent=" + choice + suffix;
  window.dispatchEvent(new Event(MARKETING_CONSENT_EVENT));
  return allowed;
}
