/**
 * Deliberately count-only historical payment-data audit.
 *
 * All commands use MongoDB count: the database evaluates predicates and returns
 * only { n: number }. Never retrieve or log a PAN, CVV, cardholder or document.
 * This audit does NOT mutate old records or declare them safe without review.
 */
export const CARD_AUDIT_METRICS = [
  { key: "legacySubscriptionsWithCardDetails", collection: "Subscription", query: { cardDetails: { $exists: true, $ne: null } } },
  { key: "legacySubscriptionsWithNonemptyCvv", collection: "Subscription", query: { "cardDetails.cvv": { $type: "string", $ne: "" } } },
  { key: "legacySubscriptionsWithNonemptyPan", collection: "Subscription", query: { "cardDetails.cardNumber": { $type: "string", $ne: "" } } },
  { key: "donationsWithLegacyCardDetails", collection: "Donation", query: { cardDetails: { $exists: true, $ne: null } } },
  { key: "donationsWithNonemptyCvv", collection: "Donation", query: { "cardDetails.cvv": { $type: "string", $ne: "" } } },
  { key: "savedCreditCardsWithNonemptyCvc", collection: "CreditCard", query: { cvc: { $type: "string", $ne: "" } } },
] as const;

/** The explicit target is a safety barrier against accidentally scanning production. */
export function validateReadOnlyCardAuditTarget(env: Record<string, string | undefined>): void {
  if (env.CARD_AUDIT_CONFIRM !== "READ_ONLY_COUNTS_APPROVED") {
    throw new Error("Explicit approval for count-only historical card audit is required");
  }
  const uri = env.DATABASE_URL;
  if (!uri) throw new Error("Missing approved MongoDB connection");
  let parsed: URL;
  try { parsed = new URL(uri); }
  catch { throw new Error("Invalid approved MongoDB connection"); }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Only an explicitly approved MongoDB target is supported");
  }
  const expectedDb = env.CARD_AUDIT_DATABASE?.trim();
  const actualDb = decodeURIComponent(parsed.pathname.slice(1));
  if (!expectedDb || !actualDb || expectedDb !== actualDb || actualDb.includes("/")) {
    throw new Error("Audit database must exactly match the separately approved database name");
  }
  // Never echo the URI, DB name, credentials, or hostname in errors/output.
}

type CountCommand = { count: string; query: object; maxTimeMS: number };
type CountExecutor = (command: CountCommand) => Promise<unknown>;
export async function runReadOnlyCardAudit(execute: CountExecutor): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const metric of CARD_AUDIT_METRICS) {
    const response = await execute({
      count: metric.collection,
      query: metric.query,
      maxTimeMS: 15000,
    });
    // Fail closed on unexpected provider output: no content, card field, or
    // raw response object is ever printed by this function.
    if (!response || typeof response !== "object") throw new Error("Audit count response invalid");
    const result = response as Record<string, unknown>;
    if (typeof result.n !== "number" || !Number.isSafeInteger(result.n) || result.n < 0) {
      throw new Error("Audit count response invalid");
    }
    counts[metric.key] = result.n;
  }
  return counts;
}
