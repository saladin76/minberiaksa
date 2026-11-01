/** Financial adjustments are separate from the original, immutable sale. */
export type BankAction = "VOID" | "REFUND";
export type BankOperation = {
  id: string; key: string; action: BankAction; state: "PENDING" | "SUCCEEDED" | "DECLINED" | "UNKNOWN";
  amountMinor: number; currency: string; createdAt: string; updatedAt: string;
  actorId: string; actorName: string; reason: string; code?: string; reference?: string;
  resolution?: { actorId: string; at: string; evidence: string };
};
export type BankDonation = {
  id: string; provider: string | null; providerOrderId: string | null; providerHostRefNum: string | null;
  providerTxnType: string | null; providerRaw: unknown; status: string; paidAt: Date | string | null;
  bankOperations?: unknown; bankOperationLock?: string | null; bankLastInquiry?: unknown;
};
export const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function bankOperations(value: unknown): BankOperation[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || !Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0 || !["PENDING", "SUCCEEDED", "DECLINED", "UNKNOWN"].includes(item.state) || !["VOID", "REFUND"].includes(item.action))) throw new Error("LEDGER_REVIEW_REQUIRED");
  return value as BankOperation[];
}
/** Accept a major-unit decimal, never round away a donor's cent. */
export function moneyMinor(value: unknown): number {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw new Error("INVALID_AMOUNT");
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 2_000_000_000) throw new Error("INVALID_AMOUNT");
  return minor;
}
export function bankSale(donation: BankDonation) {
  const raw = object(donation.providerRaw), recurring = donation.providerTxnType === "RecurringSale" || Object.keys(object(raw.albarakaRecurring)).length > 0;
  const request = donation.provider === "ALBARAKA" ? object(recurring ? raw.albarakaRecurring : raw.albarakaRequest) : object(raw.payforRequest);
  const orderId = donation.providerOrderId;
  if (!["ALBARAKA", "PAYFOR"].includes(donation.provider || "") || !orderId || String(request.orderId ?? "") !== orderId) throw new Error("SALE_REFERENCE_REQUIRED");
  const currencyCode = String(donation.provider === "ALBARAKA" ? request.currencyCode : request.currency);
  const currency = ({ TL: "TRY", US: "USD", EU: "EUR", "949": "TRY", "840": "USD", "978": "EUR" } as Record<string, string>)[currencyCode];
  const minor = donation.provider === "ALBARAKA" ? Number(request.amount) : moneyMinor(request.purchAmount);
  if (!(donation.provider === "ALBARAKA" ? ["TL", "US", "EU"] : ["949", "840", "978"]).includes(currencyCode)) throw new Error("SALE_AMOUNT_REQUIRED");
  if (!currency || !Number.isSafeInteger(minor) || minor <= 0 || minor > 2_000_000_000) throw new Error("SALE_AMOUNT_REQUIRED");
  const secure = request.mode === "3D" || request.mode === "3DS";
  return { provider: donation.provider as "ALBARAKA" | "PAYFOR", orderId, bankOrderId: donation.provider === "ALBARAKA" && secure && orderId.length === 20 ? `TDS_${orderId}` : orderId,
    reference: donation.providerHostRefNum, amountMinor: minor, currency, currencyCode, recurring,
    terminalNo: String(request.terminalNo || ""), merchantNo: String(request.merchantNo || ""), secure };
}
export function bankBalance(donation: BankDonation) {
  const sale = bankSale(donation), operations = bankOperations(donation.bankOperations);
  if (operations.some(op => op.currency !== sale.currency)) throw new Error("LEDGER_REVIEW_REQUIRED");
  const refunded = operations.filter(op => op.state === "SUCCEEDED").reduce((sum, op) => sum + op.amountMinor, 0);
  if (refunded > sale.amountMinor) throw new Error("LEDGER_REVIEW_REQUIRED");
  return { sale, operations, returnedMinor: refunded, remainingMinor: sale.amountMinor - refunded,
    blocked: Boolean(donation.bankOperationLock || operations.some(op => op.state === "PENDING" || op.state === "UNKNOWN")),
    voided: operations.some(op => op.action === "VOID" && op.state === "SUCCEEDED") };
}
export function validateBankAction(donation: BankDonation, action: BankAction, input?: unknown): number {
  if (!donation.paidAt || donation.status !== "PAID") throw new Error("CONFIRMED_SALE_REQUIRED");
  const balance = bankBalance(donation);
  if (balance.blocked) throw new Error("OPERATION_PENDING_REVIEW");
  if (balance.operations.length >= 1000) throw new Error("LEDGER_REVIEW_REQUIRED");
  if (balance.voided || balance.remainingMinor <= 0) throw new Error("NOTHING_TO_RETURN");
  if (action === "VOID" && balance.returnedMinor) throw new Error("VOID_AFTER_REFUND");
  const amount = action === "VOID" ? balance.sale.amountMinor : moneyMinor(input);
  if (amount > balance.remainingMinor) throw new Error("AMOUNT_EXCEEDS_REMAINING");
  return amount;
}
export const BANK_OPERATION_ERRORS = ["INVALID_AMOUNT", "SALE_REFERENCE_REQUIRED", "SALE_AMOUNT_REQUIRED", "LEDGER_REVIEW_REQUIRED", "CONFIRMED_SALE_REQUIRED", "OPERATION_PENDING_REVIEW", "NOTHING_TO_RETURN", "VOID_AFTER_REFUND", "AMOUNT_EXCEEDS_REMAINING", "BANK_NOT_CONFIGURED", "TERMINAL_MISMATCH", "IDEMPOTENCY_CONFLICT", "INVALID_REQUEST", "NOT_FOUND", "STALE_OPERATION"];
