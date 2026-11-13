/**
 * Parse a GA4 session cookie without ever synthesizing a Google session.
 * We cannot associate _ga_<suffix> with the server Measurement ID without
 * verifying the web stream, so ambiguous multi-stream cookies fail closed.
 * GA4's GS1 and GS2 cookie representations contain a start timestamp (seconds).
 */
export function currentGa4SessionIdFromCookies(
  cookieHeader: string,
  browser?: { doNotTrack?: string | null; globalPrivacyControl?: boolean },
  expectedStreamSuffix?: string
): string | undefined {
  if (browser?.globalPrivacyControl === true || browser?.doNotTrack === "1" || browser?.doNotTrack === "yes") return undefined;
  if (/(?:^|;\s*)(?:analytics_consent|tracking_consent)=(?:denied|rejected|false|0)(?:;|$)/i.test(cookieHeader)) return undefined;

  // Only an explicitly verified stream suffix can disambiguate several streams.
  // Supplying a property numeric ID or GTM container ID is not sufficient.
  if (expectedStreamSuffix !== undefined && !/^[A-Za-z0-9]+$/.test(expectedStreamSuffix)) return undefined;
  const streams = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    if (!/^_ga_[A-Za-z0-9]+$/.test(key)) continue;
    let value = trimmed.slice(separator + 1);
    try { value = decodeURIComponent(value); } catch { return undefined; }
    const match = /^GS1\.\d+\.(\d{10})\./.exec(value) || /^GS2\.\d+\.s(\d{10})(?:\$|$)/.exec(value);
    if (!match) continue;
    if (streams.has(key) && streams.get(key) !== match[1]) return undefined;
    streams.set(key, match[1]);
  }
  if (expectedStreamSuffix) return streams.get("_ga_" + expectedStreamSuffix);
  // Distinct streams may have the same session timestamp by chance.
  // Their equality does not prove that either belongs to the server stream.
  return streams.size === 1 ? [...streams.values()][0] : undefined;
}
