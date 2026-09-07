"use client";

import { useState, useEffect } from "react";

const CACHE_KEY = "ip_country_code";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  code: string;
  ts: number;
}

// Module-level singleton — only one fetch in-flight regardless of how many components mount
let pendingFetch: Promise<string> | null = null;

function readCache(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) { localStorage.removeItem(CACHE_KEY); return null; }
    return entry.code;
  } catch { return null; }
}

function writeCache(code: string) {
  try {
    const entry: CacheEntry = { code, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch { /* ignore */ }
}

async function fetchCountryCode(fallback: string): Promise<string> {
  try {
    // Server-side geo lookup (Vercel headers → CF → ipapi). Replaces the old
    // direct ipapi.co fetch, which was getting blocked by antivirus / CORS /
    // ad-blockers in production (visible in the Meta Pixel diagnostic console).
    const res = await fetch("/api/geo/client", { credentials: "omit" });
    if (!res.ok) return fallback;
    const data = await res.json() as { ok?: boolean; country_code?: string };
    if (!data.ok) return fallback;
    const code = typeof data.country_code === "string" ? data.country_code.trim().toLowerCase() : "";
    return /^[a-z]{2}$/.test(code) ? code : fallback;
  } catch { return fallback; }
}

/**
 * Returns the user's ISO 3166-1 alpha-2 country code (lowercase) detected from IP.
 * Result is cached in localStorage for 24 h. Falls back to `fallback` (default "tr").
 * Safe to call from multiple components — only one HTTP request is made per session.
 */
export function useIpCountry(fallback = "tr"): string {
  const [country, setCountry] = useState<string>(fallback);

  useEffect(() => {
    // Try cache first (sync, no flash)
    const cached = readCache();
    if (cached) { setCountry(cached); return; }

    // Single shared fetch
    if (!pendingFetch) {
      pendingFetch = fetchCountryCode(fallback).then((code) => {
        writeCache(code);
        return code;
      });
    }

    let active = true;
    pendingFetch.then((code) => { if (active) setCountry(code); });
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return country;
}
