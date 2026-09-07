"use client";

import { useEffect } from "react";
import { REFERRAL_COOKIE_NAME, isValidReferralCode } from "@/lib/referral";

/** Default cookie expiry in days when API is unavailable. */
const DEFAULT_COOKIE_DAYS = 30;

/** Max-age in seconds for "unlimited" (0 days) — ~10 years. */
const UNLIMITED_MAX_AGE = 10 * 365 * 24 * 60 * 60;

/**
 * Sets referral cookie when ?ref=CODE is present in the URL.
 * Fetches cookie expiry from API (per-referral); 0 = unlimited.
 */
export default function ReferralTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (!ref || !isValidReferralCode(ref)) return;

    const setCookie = (days: number) => {
      const maxAge = days === 0 ? UNLIMITED_MAX_AGE : days * 24 * 60 * 60;
      document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(ref)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    };

    fetch(`/api/referrals/cookie-expiry?code=${encodeURIComponent(ref)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const days = typeof data?.cookieExpiryDays === "number" ? data.cookieExpiryDays : DEFAULT_COOKIE_DAYS;
        setCookie(days);
      })
      .catch(() => setCookie(DEFAULT_COOKIE_DAYS));
  }, []);
  return null;
}
