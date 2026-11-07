/** Public payment redirects must never inherit the VPS's loopback request URL. */
export function paymentPublicOrigin(requestUrl: string): string {
  const local = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  for (const candidate of [process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) continue;
      if (!local && (url.protocol !== "https:" || /^(localhost\.?|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname))) continue;
      return url.origin;
    } catch { /* Try the next configured public origin. */ }
  }
  // Only local development may use the incoming origin. In production the proxy's
  // host/proto (or a caller's forwarded headers) must not receive guest tokens.
  if (local) {
    try {
      const url = new URL(requestUrl);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.origin;
    } catch { /* Use the canonical site below. */ }
  }
  return "https://minberiaksa.org";
}
