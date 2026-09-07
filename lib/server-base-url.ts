import { headers } from "next/headers";

/**
 * Absolute origin to use when server code calls this app's own API routes.
 *
 * Derived from the incoming request first, so it is correct on every
 * deployment and on whatever port `next dev` happens to be using. The
 * `NEXT_PUBLIC_API_URL` env var is only honoured when it points somewhere the
 * server can actually reach — a `http://localhost:3000` value carried from
 * `.env` into a deployed environment is what produced
 * `ECONNREFUSED 127.0.0.1:3000` on the blog routes.
 */
export async function getServerBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
      const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside a request scope (e.g. during static generation) —
    // fall through to the env-based origins below.
  }

  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv && !/localhost|127\.0\.0\.1|\[::1\]/.test(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.yedicihan.org").replace(/\/$/, "");
}
