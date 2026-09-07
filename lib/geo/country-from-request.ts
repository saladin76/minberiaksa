import type { NextRequest } from "next/server";
import { countryNameFromIsoCode } from "@/lib/geo/intl-country-name";

export type ResolvedUserGeo = {
  countryCode: string;
  countryName: string;
  region: string | null;
  city: string | null;
};

type IpapiJson = {
  country_code?: string;
  country_name?: string;
  region?: string;
  city?: string;
  error?: boolean;
  reason?: string;
};

/** Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1 → 127.0.0.1) */
export function normalizeClientIp(ip: string): string {
  const t = ip.trim();
  if (t.startsWith("::ffff:") && t.length > 7) return t.slice(7);
  return t;
}

/** First public IPv4/IPv6 from common proxy headers */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    for (const part of forwarded.split(",")) {
      const ip = normalizeClientIp(part);
      if (ip) return ip;
    }
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return normalizeClientIp(real);
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return normalizeClientIp(cf);
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
  return false;
}

function parseIpapiPayload(data: IpapiJson): ResolvedUserGeo | null {
  if (data?.error) return null;
  const code = typeof data.country_code === "string" ? data.country_code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  const name =
    typeof data.country_name === "string" && data.country_name.trim()
      ? data.country_name.trim()
      : countryNameFromIsoCode(code);
  const region =
    typeof data.region === "string" && data.region.trim() ? data.region.trim() : null;
  const city = typeof data.city === "string" && data.city.trim() ? data.city.trim() : null;
  return { countryCode: code, countryName: name, region, city };
}

async function lookupGeoByIp(ip: string): Promise<ResolvedUserGeo | null> {
  if (isNonRoutableOrLocalIp(ip)) return null;
  try {
    const path = encodeURIComponent(normalizeClientIp(ip));
    const res = await fetch(`https://ipapi.co/${path}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IpapiJson;
    return parseIpapiPayload(data);
  } catch {
    return null;
  }
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
 * Country name + ISO code + optional city/region from edge headers or IP lookup (ipapi).
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
