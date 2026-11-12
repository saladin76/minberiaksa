import { sanitizeDonationAttribution } from "../attribution/sanitize";

/**
 * GET /api/donations is also available to a signed-in donor.
 * A donor should see their own payment history, not raw gateway responses,
 * bearer receipt tokens, card payloads, or internal reconciliation state.
 *
 * The route may need providerRaw internally to derive a safe securityMode.
 * Redact only at the response boundary, AFTER computing display-only fields.
 */
export const PRIVATE_DONATION_LIST_KEYS = [
  "accessToken",
  "providerRaw",
  "cardDetails",
  "attribution",
  "originalDonorId",
  "providerAuthCode",
  "providerHostRefNum",
  "paypalOrderId",
  "paypalCaptureId",
  "bankOperations",
  "bankOperationLock",
  "bankOperationsRevision",
  "bankLastInquiry",
  "reconciliationLeaseToken",
  "reconciliationLeaseUntil",
  "reconciliationNextAt",
  "reconciliationCheckedAt",
  "conversionEventsSentAt",
  "conversionFailedEventsSentAt",
] as const;

/**
 * Revenue-authorized staff need campaign attribution and delivery status for
 * the source badge and audit dialog. Never expose the raw snapshot: older
 * records can contain unrecognized keys. Sanitize through the existing
 * allowlist, and never include the tracking snapshot for DONOR sessions.
 */
export function donationListSafeFields<T extends object>(
  donation: T,
  options: { revenueAuthorized?: boolean } = {},
): Omit<T, (typeof PRIVATE_DONATION_LIST_KEYS)[number]> {
  const safe: Record<string, unknown> = { ...donation };
  const attribution = safe.attribution;
  const conversionEventsSentAt = safe.conversionEventsSentAt;
  const conversionFailedEventsSentAt = safe.conversionFailedEventsSentAt;
  for (const key of PRIVATE_DONATION_LIST_KEYS) delete safe[key];
  if (options.revenueAuthorized) {
    safe.attribution = sanitizeDonationAttribution(attribution) ?? null;
    safe.conversionEventsSentAt = conversionEventsSentAt ?? null;
    safe.conversionFailedEventsSentAt = conversionFailedEventsSentAt ?? null;
  }
  return safe as Omit<T, (typeof PRIVATE_DONATION_LIST_KEYS)[number]>;
}
