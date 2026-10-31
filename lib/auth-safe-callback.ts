const ORIGIN = "https://minberiaksa.org";
/** Only a same-origin local path may leave the authentication error page. */
export function safeAuthCallback(raw: unknown, locale = "ar"): string {
 const fallback = `/${locale}/checkout`;
 if (typeof raw !== "string" || !raw || raw === "undefined" || /[\\\u0000-\u001f\u007f]/.test(raw) || !(raw.startsWith("/") || raw.startsWith("https://"))) return fallback;
 try {
  const url = new URL(raw, ORIGIN);
  let path = url.pathname;
  for (let i = 0; i < 2; i++) path = decodeURIComponent(path);
  if (url.origin !== ORIGIN || url.username || url.password || /[\\\u0000-\u001f\u007f]/.test(path) || /(?:^|\/)(?:api|auth)(?:\/|$)/i.test(path) || path.startsWith("//")) return fallback;
  return url.pathname + url.search + url.hash;
 } catch { return fallback; }
}
