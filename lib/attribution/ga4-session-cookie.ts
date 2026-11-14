/**
 * Parse a genuine GA4 browser session from Google Analytics' _ga_<stream> cookie.
 * GA4 uses GS1.1.<timestamp>... or GS2.1.s<timestamp>$... formats.
 * This is not the app's custom session_id and should never be fabricated.
 *
 * With several different GA4 streams we cannot safely pick a property, so
 * withhold the session ID rather than join an unrelated visitor/session.
 */
export function currentGa4SessionIdFromCookies(
  cookieHeader: string,
  browser?: { doNotTrack?: string | null; globalPrivacyControl?: boolean }
): string | undefined {
  if (browser?.globalPrivacyControl === true || browser?.doNotTrack === "1" || browser?.doNotTrack === "yes") return undefined;
  if (/(?:^|;\s*)(?:analytics_consent|tracking_consent)=(?:denied|rejected|false|0)(?:;|$)/i.test(cookieHeader)) return undefined;

  const ids = new Set<string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1 || !/^_ga_[A-Za-z0-9]+$/.test(trimmed.slice(0, separator))) continue;
    let value = trimmed.slice(separator + 1);
    try { value = decodeURIComponent(value); } catch { continue; }
    // Session start is seconds since epoch; do not harvest arbitrary digits.
    const match = /^GS1\.\d+\.(\d{10})\./.exec(value) || /^GS2\.\d+\.s(\d{10})(?:\$|$)/.exec(value);
    if (!match) continue;
    ids.add(match[1]);
    if (ids.size > 1) return undefined;
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}
