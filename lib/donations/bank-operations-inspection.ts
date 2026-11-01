import { bankSale, object, type BankDonation } from "./bank-operations-core";
import type { BankReply } from "./bank-operations-provider";

export type BankInspection = { verified: boolean; returnedMinor: number; voided: boolean };
/** Bank inquiry amounts are major-unit decimals, unlike Albaraka request Amount. */
export function inquiryMinor(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(/[.,]/);
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(n) && n <= 2_000_000_000 ? n : null;
}
export function inspectBankReply(donation: BankDonation, reply: BankReply): BankInspection {
  const result: BankInspection = { verified: false, returnedMinor: 0, voided: false };
  if (reply.state !== "SUCCEEDED") return result;
  const sale = bankSale(donation), data = object(reply.data);
  if (sale.provider === "PAYFOR") {
    if (data.OrderId !== sale.orderId || data.Currency !== sale.currencyCode || inquiryMinor(data.PurchAmount) !== sale.amountMinor || (donation.providerAuthCode && data.AuthCode !== donation.providerAuthCode)) return result;
    const returned = inquiryMinor(data.RefundedAmount);
    if (returned == null || returned > sale.amountMinor) return result;
    const voided = Boolean(String(data.VoidDate || "").trim());
    return { verified: true, returnedMinor: voided ? sale.amountMinor : returned, voided };
  }
  if (!Array.isArray(data.transactions) || data.transactions.length === 0) return result;
  const rows = data.transactions.map(object);
  if (rows.some(row => ![sale.orderId, sale.bankOrderId].includes(String(row.OrderId)) || row.CurrencyCode !== sale.currencyCode)) return result;
  const originals = rows.filter(row => row.TransactionType === "Sale");
  if (originals.length !== 1 || !originals[0].AuthCode || (donation.providerAuthCode && originals[0].AuthCode !== donation.providerAuthCode) || inquiryMinor(originals[0].Amount) !== sale.amountMinor) return result;
  let returned = 0, voided = false;
  for (const row of rows) {
    if (row.TransactionType === "Sale") continue;
    if (row.TransactionType === "Reverse" || row.TransactionType === "Void") { voided = true; continue; }
    if (row.TransactionType !== "Return") return result;
    const amount = inquiryMinor(row.Amount);
    if (amount == null || amount <= 0) return result;
    returned += amount;
  }
  if (!Number.isSafeInteger(returned) || returned > sale.amountMinor) return result;
  return { verified: true, returnedMinor: voided ? sale.amountMinor : returned, voided };
}
