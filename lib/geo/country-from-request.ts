import type { NextRequest } from "next/server";
import { countryNameFromIsoCode } from "@/lib/geo/intl-country-name";
import { lookupIpGeo } from "@/lib/geo/ip-lookup";

export type ResolvedUserGeo = {
  countryCode: string;
  countryName: string;
  region: string | null;
  city: string | null;
};

/** Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1) */
export function normalizeClientIp(ip: string): string {
  const t = ip.trim();
  if (t.startsWith("::ffff:") && t.length > 7) return t.slice(7);
  return t;
}

/**
 * The visitor's public IP, from the header the proxy in front of us sets
 * itself rather than one the browser can send:
 *
 *   1. `cf-connecting-ip`  Cloudflare, when the site is behind it;
 *   2. `x-real-ip`  nginx on the VPS (`proxy_set_header X-Real-IP
 *      $remote_addr`), and Vercel, which sets it to the client;
 *   3. `x-forwarded-for`, read from the RIGHT: each proxy appends the
 *      address it saw, so the left end is whatever the client claimed and the
 *      first public address from the right is the one our own proxy saw.
 *
 * Reading X-Forwarded-For from the left, as this did, took a value any
 * browser or upstream proxy can put there.
 */
export function getClientIp(request: NextRequest): string | null {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf && !isNonRoutableOrLocalIp(cf)) return normalizeClientIp(cf);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && !isNonRoutableOrLocalIp(real)) return normalizeClientIp(real);
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map(normalizeClientIp).filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      if (!isNonRoutableOrLocalIp(hops[i])) return hops[i];
    }
  }
  return null;
}

function isNonRoutableOrLocalIp(ip: string): boolean {
  const n = normalizeClientIp(ip);
  if (!n) return true;
  if (n === "::1" || n === "127.0.0.1") return true;
  if (n.startsWith("10.")) return true;
  if (n.startsWith("192.168.")) return true;
  if (n.startsWith("172.")) {
    const second = Number(n.split(".")[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) return true;
  }
  if (n.startsWith("fc") || n.startsWith("fd")) return true;
  if (n.startsWith("fe80:") || n.startsWith("169.254.") || n.startsWith("0.")) return true;
  // Carrier-grade NAT (100.64.0.0/10): a mobile carrier's internal address.
  if (n.startsWith("100.")) {
    const second = Number(n.split(".")[1]);
    if (!Number.isNaN(second) && second >= 64 && second <= 127) return true;
  }
  return false;
}

/** Several IP databases, majority vote (`ip-lookup.ts`). */
async function lookupGeoByIp(ip: string): Promise<ResolvedUserGeo | null> {
  if (isNonRoutableOrLocalIp(ip)) return null;
  const geo = await lookupIpGeo(normalizeClientIp(ip));
  return geo ? { ...geo, countryName: countryNameFromIsoCode(geo.countryCode) } : null;
}

function geoFromVercelHeaders(request: NextRequest): ResolvedUserGeo | null {
  const code = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  const city = request.headers.get("x-vercel-ip-city")?.trim() || null;
  const region = request.headers.get("x-vercel-ip-country-region")?.trim() || null;
  return {
    countryCode: code,
    countryName: countryNameFromIsoCode(code),
    region: region || null,
    city: city || null,
  };
}

function geoFromCfCountryCode(request: NextRequest): ResolvedUserGeo | null {
  const cf = request.headers.get("cf-ipcountry")?.trim().toUpperCase();
  if (!cf || !/^[A-Z]{2}$/.test(cf) || cf === "XX") return null;
  return {
    countryCode: cf,
    countryName: countryNameFromIsoCode(cf),
    region: null,
    city: null,
  };
}

/**
 * Country name + ISO code + optional city/region: the CDN's own geolocation
 * when the site runs behind one (Vercel, Cloudflare), else the client IP
 * looked up in several databases.
 */
export async function resolveGeoFromRequest(
  request: NextRequest
): Promise<ResolvedUserGeo | null> {
  const v = geoFromVercelHeaders(request);
  if (v) return v;
  const cf = geoFromCfCountryCode(request);
  if (cf) return cf;
  const ip = getClientIp(request);
  if (!ip) return null;
  return lookupGeoByIp(ip);
}

/** @deprecated use resolveGeoFromRequest */
export async function resolveCountryCodeFromRequest(
  request: NextRequest
): Promise<string | null> {
  const g = await resolveGeoFromRequest(request);
  return g?.countryCode ?? null;
}
