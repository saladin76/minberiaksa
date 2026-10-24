/** Source metadata for donations already collected outside checkout. */
export type ManualDonationProvider =
  | "BANK"
  | "PAYFOR"
  | "ALBARAKA"
  | "STRIPE"
  | "PAYPAL"
  | "CHARITY_GIVING";

/**
 * Manual entries record the selected platform as their source. They never
 * represent a new charge, so the payment method stays at the existing manual
 * bookkeeping value for every source (including PayPal).
 */
export function manualDonationRecordFields(provider: ManualDonationProvider) {
  return { paymentMethod: "CARD" as const, provider };
}
