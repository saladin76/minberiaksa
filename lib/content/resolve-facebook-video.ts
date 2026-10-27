const FACEBOOK_VIDEO_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch", "www.fb.watch"]);
export function facebookVideoUrl(input: string): URL | null {
  if (input.length > 2048) return null;
  try { const url = new URL(input); return url.protocol === "https:" && !url.username && !url.password && !url.port && FACEBOOK_VIDEO_HOSTS.has(url.hostname) ? url : null; } catch { return null; }
}
/** Validate every redirect before fetching it; public short links cannot reach arbitrary hosts. */
export async function resolveFacebookVideoUrl(input: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  let url = facebookVideoUrl(input); if (!url) return null;
  const seen = new Set<string>();
  for (let hop = 0; hop < 4; hop++) {
    if (seen.has(url.href)) return input; seen.add(url.href);
    try {
      const response = await fetcher(url.href, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "MinberVideoPreview/1.0" } });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response.ok ? url.href : input;
      const location = response.headers.get("location"); if (!location) return input;
      const next = facebookVideoUrl(new URL(location, url.href).href); if (!next) return input;
      url = next;
    } catch { return input; }
  }
  return input;
}
