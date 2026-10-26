export type AlbarakaRequestSnapshot = { orderId?: string; amount?: number; currencyCode?: string; transactionType?: string; mode?: string };

/** Run after MAC verification, before ANY failure write or capture claim. */
export function albaraka3DLinkageError(raw: Record<string, string>, snapshot: AlbarakaRequestSnapshot, expectedOrderId: string, merchantNo: string): string | null {
  if (snapshot.mode === "2D" || !/^[A-F0-9]{20}$/i.test(expectedOrderId) || raw.OrderId !== expectedOrderId || (snapshot.orderId && snapshot.orderId !== expectedOrderId)) return "OrderId mismatch";
  if (raw.MerchantId !== merchantNo) return "Merchant mismatch";
  const amount = Number(raw.Amount);
  if (!raw.Amount?.trim() || !Number.isSafeInteger(amount) || amount <= 0 || amount !== snapshot.amount) return "Amount mismatch";
  if (!snapshot.currencyCode || raw.Currency !== snapshot.currencyCode) return "Currency mismatch";
  if (raw.TranType !== "Sale" || (snapshot.transactionType && snapshot.transactionType !== "Sale")) return "Transaction type mismatch";
  return null;
}
