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

export function donationListSafeFields<T extends object>(
  donation: T,
): Omit<T, (typeof PRIVATE_DONATION_LIST_KEYS)[number]> {
  const safe: Record<string, unknown> = { ...donation };
  for (const key of PRIVATE_DONATION_LIST_KEYS) delete safe[key];
  return safe as Omit<T, (typeof PRIVATE_DONATION_LIST_KEYS)[number]>;
}
