/**
 * Donation abuse decision engine. Pure functions only: NO provider calls,
 * no DB writes and no site-wide IP blocks.
 * The persistence layer must serialize updates by actor and dedupe eventId.
 */
export type FailureSignal = "BANK_DECLINED" | "CARD_VALIDATION" | "AUTHENTICATION_FAILED";
export type PaymentSignal = FailureSignal | "PENDING" | "PAID" | "PROVIDER_ERROR" | "UNKNOWN";
export type ProtectionPhase = "NORMAL" | "COOLDOWN" | "PROBATION" | "REVIEW_BLOCK";
export type PaymentEvidence = {
  eventId: string;
  paymentId: string;
  at: number;
  result: PaymentSignal;
};
export type ProtectionState = {
  phase: ProtectionPhase;
  startedAt: number;
  until: number | null;
  failedAttempts: number;
  processedEventIds: string[];
};
export type ProtectionConfig = {
  initialFailures: number;
  cooldownMs: number;
  probationFailures: number;
  reviewBlockMs: number;
  windowMs: number;
  manualRelease: boolean;
};
export const DEFAULT_DONATION_PROTECTION: Readonly<ProtectionConfig> = Object.freeze({
  initialFailures: 4,
  cooldownMs: 5 * 60_000,
  probationFailures: 3,
  reviewBlockMs: 24 * 60 * 60_000,
  windowMs: 30 * 60_000,
  manualRelease: true,
});
export const initialProtectionState = (at: number): ProtectionState => ({
  phase: "NORMAL", startedAt: at, until: null, failedAttempts: 0, processedEventIds: [],
});
const isFailure = (result: PaymentSignal): result is FailureSignal =>
  result === "BANK_DECLINED" || result === "CARD_VALIDATION" || result === "AUTHENTICATION_FAILED";
const dedupe = (ids: string[], id: string) => [...ids.slice(-255), id];

export function advanceProtection(
  state: ProtectionState,
  event: PaymentEvidence,
  now: number,
  config: Readonly<ProtectionConfig> = DEFAULT_DONATION_PROTECTION,
): ProtectionState {
  if (!Number.isFinite(now) || !Number.isFinite(event.at) || !event.eventId || !event.paymentId)
    throw new Error("INVALID_PAYMENT_EVIDENCE");
  if (state.processedEventIds.includes(event.eventId)) return state;
  // A pending response, a transport failure or an unknown settlement is NOT a bank decline.
  if (!isFailure(event.result)) return { ...state, processedEventIds: dedupe(state.processedEventIds, event.eventId) };
  if (state.phase === "REVIEW_BLOCK") return { ...state, processedEventIds: dedupe(state.processedEventIds, event.eventId) };
  if (state.phase === "COOLDOWN" && state.until !== null && now < state.until)
    return { ...state, processedEventIds: dedupe(state.processedEventIds, event.eventId) };
  // Do not keep a donor on probation forever: after a full clean
  // observation window the counter returns to NORMAL.
  const probationExpired = state.phase === "PROBATION" && now - state.startedAt >= config.windowMs;
  const phase: ProtectionPhase = probationExpired ? "NORMAL"
    : state.phase === "COOLDOWN" ? "PROBATION" : state.phase;
  const expired = now - state.startedAt >= config.windowMs;
  const reset = expired || state.phase === "COOLDOWN";
  const failures = (reset ? 0 : state.failedAttempts) + 1;
  const startedAt = reset ? now : state.startedAt;
  const threshold = phase === "PROBATION" ? config.probationFailures : config.initialFailures;
  if (failures >= threshold) {
    return phase === "PROBATION"
      ? { phase: "REVIEW_BLOCK", startedAt: now, until: now + config.reviewBlockMs, failedAttempts: failures, processedEventIds: dedupe(state.processedEventIds, event.eventId) }
      : { phase: "COOLDOWN", startedAt: now, until: now + config.cooldownMs, failedAttempts: failures, processedEventIds: dedupe(state.processedEventIds, event.eventId) };
  }
  return { phase, startedAt, until: null, failedAttempts: failures, processedEventIds: dedupe(state.processedEventIds, event.eventId) };
}

export function paymentRestriction(
  state: ProtectionState,
  now: number,
  config: Readonly<ProtectionConfig> = DEFAULT_DONATION_PROTECTION,
): { blocked: boolean; reason: "COOLDOWN" | "MANUAL_REVIEW" | null; retryAt: number | null } {
  if (state.phase === "REVIEW_BLOCK") {
    if (config.manualRelease || state.until === null || now < state.until)
      return { blocked: true, reason: "MANUAL_REVIEW", retryAt: config.manualRelease ? null : state.until };
  }
  if (state.phase === "COOLDOWN" && state.until !== null && now < state.until)
    return { blocked: true, reason: "COOLDOWN", retryAt: state.until };
  return { blocked: false, reason: null, retryAt: null };
}

/** Only an authenticated and audited operator action may call this from the service layer. */
export function releaseProtection(now: number): ProtectionState {
  return initialProtectionState(now);
}
