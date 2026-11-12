"use client";

import { useState, useEffect } from "react";

/* v2: answers stored before the geo endpoint stopped being CDN-cached may be
   another visitor's country, so they are dropped rather than trusted. */
const CACHE_KEY = "ip_country_code_v2";
const STALE_KEYS = ["ip_country_code", "ipapi_cache"]; // the dialogs now use "ipapi_cache_v2"
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours  people travel, VPNs switch

interface CacheEntry {
  code: string;
  ts: number;
}

// Module-level singleton  only one fetch in-flight regardless of how many components mount
let pendingFetch: Promise<string | null> | null = null;

function readCache(): string | null {
  try {
    for (const key of STALE_KEYS) localStorage.removeItem(key);
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (!entry || typeof entry.code !== "string" || !/^[a-z]{2}$/.test(entry.code) ||
        !Number.isFinite(entry.ts) || entry.ts > Date.now() ||
        Date.now() - entry.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.code;
  } catch { return null; }
}

function writeCache(code: string) {
  try {
    const entry: CacheEntry = { code, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* ignore */ }
}

async function fetchCountryCode(): Promise<string | null> {
  try {
    // Server-side geo lookup (Vercel headers → CF → ipapi). Replaces the old
    // direct ipapi.co fetch, which was getting blocked by antivirus / CORS /
    // ad-blockers in production (visible in the Meta Pixel diagnostic console).
    const res = await fetch("/api/geo/client", { credentials: "omit" });
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; country_code?: string };
    if (!data.ok) return null;
    const code = typeof data.country_code === "string" ? data.country_code.trim().toLowerCase() : "";
    return /^[a-z]{2}$/.test(code) && !["xx", "eu", "ap"].includes(code) ? code : null;
  } catch { return null; }
}

/**
 * Returns the user's ISO 3166-1 alpha-2 country code (lowercase) detected from IP.
 * Result is cached in localStorage for 6 h. Falls back to `fallback` (default "tr").
 * Safe to call from multiple components  only one HTTP request is made per session.
 */
export function useIpCountry(fallback = "tr"): string {
  const [country, setCountry] = useState<string>(fallback);

  useEffect(() => {
    // Try cache first (sync, no flash)
    const cached = readCache();
    if (cached) { setCountry(cached); return; }

    // Single shared fetch
    if (!pendingFetch) {
      pendingFetch = fetchCountryCode().then((code) => {
        // A failure is not a real IP-country detection. Never pin TR (or another
        // fallback) in a six-hour cache because an API was briefly unavailable.
        if (code) writeCache(code);
        return code;
      }).finally(() => { pendingFetch = null; });
    }

    let active = true;
    pendingFetch.then((code) => { if (active && code) setCountry(code); });
    return () => { active = false; };
  }, []);

  return country;
}
