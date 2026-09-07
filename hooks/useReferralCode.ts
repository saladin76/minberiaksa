"use client";

import { useCallback } from "react";
import { REFERRAL_COOKIE_NAME } from "@/lib/referral";

/**
 * Returns a function that reads the current referral code from the cookie.
 * Call it when submitting a donation to send referralCode to the API.
 */
export function useReferralCode(): () => string | null {
  return useCallback(() => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(new RegExp(`${REFERRAL_COOKIE_NAME}=([^;]+)`));
    const value = match?.[1];
    return value ? decodeURIComponent(value.trim()) : null;
  }, []);
}
