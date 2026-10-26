/** Display-only diagnostics. No persistence, settlement, capture or retry dependencies. */
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

type GatewayAmountInput = {
  provider: string | null;
  paidAt: Date | string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  providerRaw: unknown;
};

/** A request snapshot proves the amount attempted; only the ledger records confirmed money. */
export function gatewayDisplayAmounts(donation: GatewayAmountInput) {
  const raw = record(donation.providerRaw);
  let requestedGatewayAmount: number | null = null;
  let requestedGatewayCurrency: string | null = null;
  if (donation.provider === "ALBARAKA") {
    const request = record(raw.albarakaRequest);
    const minor = Number(request.amount);
    const code = String(request.currencyCode ?? "");
    if (Number.isFinite(minor) && minor > 0 && ["TL", "US", "EU"].includes(code)) {
      requestedGatewayAmount = minor / 100;
      requestedGatewayCurrency = ({ TL: "TRY", US: "USD", EU: "EUR" } as Record<string, string>)[code];
    }
  } else if (donation.provider === "PAYPAL") {
    const request = record(raw.paypalRequest);
    const value = Number(request.value);
    if (Number.isFinite(value) && value > 0 && typeof request.currency === "string" && /^[A-Z]{3}$/.test(request.currency)) {
      requestedGatewayAmount = value;
      requestedGatewayCurrency = request.currency;
    }
  }
  return {
    paidAmount: donation.paidAt ? donation.paidAmount : null,
    paidCurrency: donation.paidAt ? donation.paidCurrency : null,
    requestedGatewayAmount,
    requestedGatewayCurrency,
  };
}

export type PayPalInspectionOutcome =
  | "awaiting_buyer_action" | "approved_without_capture" | "capture_pending"
  | "completed_needs_reconciliation" | "capture_failed" | "capture_refunded" | "order_voided"
  | "order_not_found" | "provider_unavailable" | "not_configured" | "order_reference_missing"
  | "renewal_not_checked" | "integrity_review" | "unknown";

export type PayPalInspection = {
  readOnly: true;
  checkedAt: string;
  outcome: PayPalInspectionOutcome;
  orderStatus: string | null;
  captureStatus: string | null;
  pendingReason: string | null;
  httpStatus?: number;
};

type PayPalInspectionInput = {
  id: string;
  paypalOrderId: string | null;
  providerOrderId: string | null;
  providerRaw: unknown;
  billingReason: string | null;
};

export async function inspectPayPalCheckout(
  donation: PayPalInspectionInput,
  { readOrder, configured, now = new Date() }: { readOrder: (id: string) => Promise<unknown>; configured: boolean; now?: Date },
): Promise<PayPalInspection> {
  const result: PayPalInspection = { readOnly: true, checkedAt: now.toISOString(), outcome: "unknown", orderStatus: null, captureStatus: null, pendingReason: null };
  const raw = record(donation.providerRaw);
  if (raw.paypalRecurring || donation.billingReason === "subscription_cycle") return { ...result, outcome: "renewal_not_checked" };
  if (!configured) return { ...result, outcome: "not_configured" };
  const snapshot = record(raw.paypalRequest);
  const id = donation.paypalOrderId || snapshot.orderId || donation.providerOrderId;
  if (typeof id !== "string" || !/^[A-Z0-9]{8,32}$/i.test(id)) return { ...result, outcome: "order_reference_missing" };
  try {
    const order = record(await readOrder(id));
    const units = Array.isArray(order.purchase_units) ? order.purchase_units.map(record) : [];
    const captures = units.flatMap(unit => {
      const payments = record(unit.payments);
      return Array.isArray(payments.captures) ? payments.captures.map(record) : [];
    });
    const capture = captures[0];
    const known = (value: unknown, choices: string[]) => typeof value === "string" && choices.includes(value) ? value : null;
    result.orderStatus = known(order.status, ["CREATED", "SAVED", "PAYER_ACTION_REQUIRED", "APPROVED", "COMPLETED", "VOIDED"]);
    result.captureStatus = known(capture?.status, ["PENDING", "COMPLETED", "FAILED", "DECLINED", "REFUNDED", "PARTIALLY_REFUNDED"]);
    result.pendingReason = known(record(capture?.status_details).reason, [
      "BUYER_COMPLAINT", "CHARGEBACK", "ECHECK", "INTERNATIONAL_WITHDRAWAL", "OTHER", "PENDING_REVIEW",
      "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION", "REFUNDED", "TRANSACTION_APPROVED_AWAITING_FUNDING",
      "UNILATERAL", "VERIFICATION_REQUIRED", "DECLINED_BY_RISK_FRAUD_FILTERS",
    ]);
    if (order.id !== id || (snapshot.orderId && snapshot.orderId !== id) || units.length !== 1 || (units[0]?.custom_id ?? capture?.custom_id) !== donation.id || captures.length > 1) {
      result.outcome = "integrity_review";
    } else if (result.captureStatus === "PENDING") result.outcome = "capture_pending";
    else if (result.captureStatus === "COMPLETED") result.outcome = "completed_needs_reconciliation";
    else if (["FAILED", "DECLINED"].includes(result.captureStatus ?? "")) result.outcome = "capture_failed";
    else if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(result.captureStatus ?? "")) result.outcome = "capture_refunded";
    else if (result.orderStatus === "VOIDED") result.outcome = "order_voided";
    else if (result.orderStatus === "APPROVED" && captures.length === 0) result.outcome = "approved_without_capture";
    else if (["CREATED", "SAVED", "PAYER_ACTION_REQUIRED"].includes(result.orderStatus ?? "") && captures.length === 0) result.outcome = "awaiting_buyer_action";
    return result;
  } catch (error) {
    const status = record(error).status;
    return { ...result, outcome: status === 404 ? "order_not_found" : "provider_unavailable", ...(typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? { httpStatus: status } : {}) };
  }
}
