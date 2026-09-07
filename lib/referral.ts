/** Cookie name for storing referral code (client-side). */
export const REFERRAL_COOKIE_NAME = "referral_code";

/**
 * Get referral code from cookie (use in API from Cookie header).
 * Format: "referral_code=CODE" in Cookie header.
 */
export function getReferralCodeFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${REFERRAL_COOKIE_NAME}=([^;]+)`));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Safe for alphanumeric + underscore/hyphen codes only.
 */
export function isValidReferralCode(code: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(code) && code.length >= 1 && code.length <= 64;
}
