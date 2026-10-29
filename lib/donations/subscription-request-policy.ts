export function requestMatchesPlan(request: { kind: string; requestedAmount: number | null }, plan: { status: string; amount: number } | null) {
  if (!plan) return false;
  if (request.kind === "CANCEL") return plan.status === "CANCELLED";
  if (request.kind === "PAUSE") return plan.status === "PAUSED";
  return request.kind === "AMOUNT_CHANGE" && request.requestedAmount !== null && Math.abs(plan.amount - request.requestedAmount) < 0.00001;
}
