/**
 * Donation guard — pure decisions (no I/O), so every rule is unit-tested.
 *
 * Owner's rule (2026-11-15): 6 unpaid card attempts (failed OR still pending)
 * within the window → 5-minute freeze. After the freeze, 6 more unpaid attempts
 * → blocked until a person releases it from /dashboard/security (the donor may
 * file a release request). A probation with no further trouble clears itself.
 * Verified previous donors (trusted device or signed-in donor with a paid gift)
 * are exempt; a known e-mail/phone gets a multiplied threshold.
 */
export type GuardMode = "OFF" | "MONITOR" | "ENFORCE";
export type GuardSettings = {
  mode: GuardMode;
  stage1: number;
  stage2: number;
  windowMinutes: number;
  cooldownMinutes: number;
  probationHours: number;
  knownDonorMultiplier: number;
};
export const DEFAULT_GUARD_SETTINGS: Readonly<GuardSettings> = Object.freeze({
  mode: "MONITOR",
  stage1: 6,
  stage2: 6,
  windowMinutes: 30,
  cooldownMinutes: 5,
  probationHours: 24,
  knownDonorMultiplier: 2,
});

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
/** Never trust stored or posted settings blindly: bounded values only. */
export function normalizeGuardSettings(raw: unknown, envMode?: string | null): GuardSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GUARD_SETTINGS;
  const stored = r.mode === "OFF" || r.mode === "MONITOR" || r.mode === "ENFORCE" ? r.mode : d.mode;
  // Infrastructure override can only make the guard LESS active (emergency off switch).
  const mode: GuardMode = envMode === "OFF" ? "OFF" : envMode === "MONITOR" && stored === "ENFORCE" ? "MONITOR" : stored;
  return {
    mode,
    stage1: clampInt(r.stage1, 3, 50, d.stage1),
    stage2: clampInt(r.stage2, 2, 50, d.stage2),
    windowMinutes: clampInt(r.windowMinutes, 5, 240, d.windowMinutes),
    cooldownMinutes: clampInt(r.cooldownMinutes, 1, 120, d.cooldownMinutes),
    probationHours: clampInt(r.probationHours, 1, 168, d.probationHours),
    knownDonorMultiplier: clampInt(r.knownDonorMultiplier, 1, 5, d.knownDonorMultiplier),
  };
}

export type GuardPhase = "COOLDOWN" | "PROBATION" | "BLOCKED";
export type GuardCaseState = { phase: GuardPhase; cooldownUntil: number; probationSince: number; blockedAt?: number };
export type GuardAction = "ALLOW" | "COOLDOWN" | "BLOCK";
export type GuardTransition = "FROZE" | "BLOCKED" | "CLEARED" | null;
export type GuardDecision = { action: GuardAction; next: GuardCaseState | null; transition: GuardTransition; retryAt: number | null };

/**
 * One identity key (IP, device, e-mail or phone). `unpaidInWindow` counts this
 * key's unpaid attempts in the last window; `unpaidSinceProbation` those made
 * after the freeze ended. The attempt being decided is NOT included.
 */
export function decideGuard(input: {
  state: GuardCaseState | null;
  unpaidInWindow: number;
  unpaidSinceProbation: number;
  now: number;
  known: boolean;
  settings: GuardSettings;
}): GuardDecision {
  const { state, now, settings: s } = input;
  const mult = input.known ? s.knownDonorMultiplier : 1;
  const t1 = s.stage1 * mult, t2 = s.stage2 * mult;
  if (state?.phase === "BLOCKED") return { action: "BLOCK", next: state, transition: null, retryAt: null };
  if (state?.phase === "COOLDOWN" && now < state.cooldownUntil)
    return { action: "COOLDOWN", next: state, transition: null, retryAt: state.cooldownUntil };
  if (state && (state.phase === "COOLDOWN" || state.phase === "PROBATION")) {
    const probation: GuardCaseState = { phase: "PROBATION", cooldownUntil: state.cooldownUntil, probationSince: state.cooldownUntil };
    if (now - probation.probationSince >= s.probationHours * 3600_000) {
      // A clean probation clears itself; judge this attempt afresh.
      const fresh = decideGuard({ ...input, state: null, unpaidSinceProbation: 0 });
      return fresh.transition ? fresh : { ...fresh, transition: "CLEARED" };
    }
    if (input.unpaidSinceProbation >= t2)
      return { action: "BLOCK", next: { ...probation, phase: "BLOCKED", blockedAt: now }, transition: "BLOCKED", retryAt: null };
    return { action: "ALLOW", next: probation, transition: null, retryAt: null };
  }
  if (input.unpaidInWindow >= t1) {
    const until = now + s.cooldownMinutes * 60_000;
    return { action: "COOLDOWN", next: { phase: "COOLDOWN", cooldownUntil: until, probationSince: until }, transition: "FROZE", retryAt: until };
  }
  return { action: "ALLOW", next: null, transition: null, retryAt: null };
}

const RANK: Record<GuardAction, number> = { ALLOW: 0, COOLDOWN: 1, BLOCK: 2 };
export function strictest(decisions: GuardDecision[]): GuardDecision {
  return decisions.reduce<GuardDecision>((a, b) => (RANK[b.action] > RANK[a.action] ? b : a), { action: "ALLOW", next: null, transition: null, retryAt: null });
}

/** Normalizers used for both counting keys and known-donor lookups. */
export const normEmail = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? s : null;
};
export const normPhone = (v: unknown) => {
  const d = typeof v === "string" ? v.replace(/\D/g, "").replace(/^00/, "") : "";
  return d.length >= 8 && d.length <= 15 ? d : null;
};
export const normDevice = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(v) ? v : null);
