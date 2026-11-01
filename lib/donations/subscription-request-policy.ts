export const OPEN_REQUEST_STATUSES = ["NEW", "IN_PROGRESS"];
export const CLOSED_REQUEST_STATUSES = ["COMPLETED", "REJECTED", "WITHDRAWN"];

export type RequestEvent = { status: string; at: string; actorRole: "DONOR" | "TEAM"; reply?: string };
export function requestHistory(raw: unknown): RequestEvent[] {
  return Array.isArray(raw) ? raw.filter((event): event is RequestEvent => event && typeof event === "object" &&
    [...OPEN_REQUEST_STATUSES, ...CLOSED_REQUEST_STATUSES].includes(event.status) && typeof event.at === "string" &&
    Number.isFinite(Date.parse(event.at)) && ["DONOR", "TEAM"].includes(event.actorRole)).slice(-50)
    .map(event => ({ status: event.status, at: event.at, actorRole: event.actorRole, ...(typeof event.reply === "string" ? { reply: event.reply.slice(0, 2000) } : {}) })) : [];
}
export function validReduction(amount: unknown, current: number) {
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 1 && amount < current &&
    Math.abs(Math.round(amount * 100) - amount * 100) < 1e-7;
}

export function isReductionRequestForPlan(
  request: { donorId: string; subscriptionId: string; kind: string; status: string; currency: string; requestedAmount: number | null } | null | undefined,
  plan: { id: string; donorId: string; currency: string; amount: number },
) {
  return !!request && !!plan.donorId && request.donorId === plan.donorId && request.subscriptionId === plan.id &&
    request.kind === "AMOUNT_CHANGE" && OPEN_REQUEST_STATUSES.includes(request.status) &&
    request.currency === plan.currency && validReduction(request.requestedAmount, plan.amount);
}
export function requestMatchesPlan(request: { kind: string; requestedAmount: number | null; currency?: string; donorId?: string }, plan: { status: string; amount: number; currency?: string; donorId?: string } | null) {
  if (!plan) return false;
  if (request.currency && plan.currency && request.currency !== plan.currency || request.donorId && plan.donorId && request.donorId !== plan.donorId) return false;
  if (request.kind === "CANCEL") return plan.status === "CANCELLED";
  if (request.kind === "PAUSE") return plan.status === "PAUSED";
  return request.kind === "AMOUNT_CHANGE" && ["ACTIVE", "PAUSED"].includes(plan.status) && request.requestedAmount !== null && Math.abs(plan.amount - request.requestedAmount) < 0.00001;
}
