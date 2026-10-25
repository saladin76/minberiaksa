import { isIP } from "node:net";

/** Preserve genuine IPv6; reject malformed values rather than deleting characters. */
export function normalizeTrackingClientIp(value: string | null | undefined): string | undefined {
  const first = value?.split(",")[0]?.trim();
  if (!first || first.includes("%")) return undefined;
  if (isIP(first)) return first;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(first);
  if (bracketed && isIP(bracketed[1]) === 6) return bracketed[1];
  const withPort = /^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(first);
  return withPort && isIP(withPort[1]) === 4 ? withPort[1] : undefined;
}

export function getTrackingClientIp(headers: Pick<Headers, "get">): string | undefined {
  // Enable only where the origin accepts requests exclusively from Cloudflare
  // and overwrites these headers. CF-Connecting-IPv6 covers Pseudo IPv4 mode.
  if (process.env.TRACKING_TRUST_CLOUDFLARE === "true") {
    const ipv6 = normalizeTrackingClientIp(headers.get("cf-connecting-ipv6"));
    if (ipv6 && isIP(ipv6) === 6) return ipv6;
    const cf = normalizeTrackingClientIp(headers.get("cf-connecting-ip"));
    if (cf) return cf;
  }
  return normalizeTrackingClientIp(headers.get("x-forwarded-for")) ?? normalizeTrackingClientIp(headers.get("x-real-ip"));
}
