/** Display-only evidence. Never infer verification from a successful payment alone. */
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type PaymentEvidenceInput = { provider?: string | null; providerTxnType?: string | null; providerProcReturnCode?: string | null; billingReason?: string | null; providerRaw?: unknown };

export function donationPaymentEvidence(row: PaymentEvidenceInput) {
  const raw = record(row.providerRaw);
  const request = record(raw.albarakaRequest);
  const recurring = row.providerTxnType === "RecurringSale" || row.billingReason === "subscription_cycle" || Object.keys(record(raw.albarakaRecurring)).length > 0;
  let securityMode: "2D" | "3D" | null = null;
  if (row.provider === "PAYFOR") securityMode = "3D";
  if (row.provider === "ALBARAKA") {
    if (recurring || request.mode === "2D") securityMode = "2D";
    else if (["3D", "3DS"].includes(String(request.mode))) securityMode = "3D";
  }
  const stored = row.providerProcReturnCode?.trim();
  const nested = row.provider === "ALBARAKA" ? record(record(raw.albarakaSale).ServiceResponseData).ResponseCode : null;
  const candidate = stored || (typeof nested === "string" ? nested.trim() : "");
  const bankResponseCode = /^(?:[0-9A-Z]{2}|[0-9]{4})$/.test(candidate) ? candidate : null;
  return { securityMode, bankResponseCode, isRecurringCharge: recurring };
}
