/** Whole UTC calendar days elapsed since the referral’s creation date (0 on creation day). */
export function getUtcCalendarDaysPassedSinceCreation(
  createdAt: Date | string,
  now: Date = new Date()
): number {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const startUtc = Date.UTC(
    created.getUTCFullYear(),
    created.getUTCMonth(),
    created.getUTCDate()
  );
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - startUtc) / (24 * 60 * 60 * 1000)));
}

/** Minimum `cookieExpiryDays` when editing a finite duration: days passed + 1 (UTC calendar days). */
export function getMinCookieExpiryDaysForEdit(
  createdAt: Date | string,
  now: Date = new Date()
): number {
  return getUtcCalendarDaysPassedSinceCreation(createdAt, now) + 1;
}

/**
 * Admin rule: cookie duration (`cookieExpiryDays`) may be edited only while the
 * referral is still within its initial window: `createdAt` + `cookieExpiryDays` (UTC calendar days).
 * `cookieExpiryDays === 0` (unlimited) → always editable; no countdown.
 */
export function getReferralCookieSettingsWindow(
  createdAt: Date | string,
  cookieExpiryDays: number,
  now: Date = new Date()
): { daysLeft: number | null; canEditCookieExpiry: boolean } {
  const days = cookieExpiryDays ?? 30;
  if (days <= 0) {
    return { daysLeft: null, canEditCookieExpiry: true };
  }
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const startUtc = Date.UTC(
    created.getUTCFullYear(),
    created.getUTCMonth(),
    created.getUTCDate()
  );
  const endMs = startUtc + days * 24 * 60 * 60 * 1000;
  const diff = endMs - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  return { daysLeft, canEditCookieExpiry: daysLeft > 0 };
}
