/**
 * Staged e-mail waves — pure rules (no I/O).
 *
 * Owner's rule (2026-11-15): everyone receives the campaign the SAME day, but the most engaged
 * go first; the rest follow in waves measured from the moment the campaign actually starts
 * (sent now or at its scheduled time). Mail providers judge a sender by early engagement, so
 * opening with people who read protects inbox placement for everyone else.
 *
 *   wave 1  at start            engaged: opened/clicked an e-mail or donated in the last 180 days
 *   wave 2  start + 2h          donated in the last 365 days
 *   wave 3  start + 3h          opened an e-mail at any time
 *   wave 4+ start + 4h, 5h, …   everyone else, split evenly into hourly slices
 */
export type StagedConfig = {
  enabled: boolean;
  firstGapMinutes: number;
  waveGapMinutes: number;
  restSlices: number;
  engagedDays: number;
  recentDonorDays: number;
  holdSpamRatePct: number;
  holdMinSample: number;
};
export const DEFAULT_STAGED: Readonly<StagedConfig> = Object.freeze({
  enabled: true, firstGapMinutes: 120, waveGapMinutes: 60, restSlices: 4,
  engagedDays: 180, recentDonorDays: 365, holdSpamRatePct: 5, holdMinSample: 200,
});
const int = (v: unknown, min: number, max: number, d: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
/** Applies to marketing e-mail only; any campaign can opt out with metadata.staged.enabled = false. */
export function stagedConfigFor(campaign: { channel: string; purpose?: string | null; metadata?: unknown }): StagedConfig {
  const meta = (campaign.metadata && typeof campaign.metadata === "object" ? campaign.metadata : {}) as Record<string, unknown>;
  const raw = (meta.staged && typeof meta.staged === "object" ? meta.staged : {}) as Record<string, unknown>;
  const d = DEFAULT_STAGED;
  const eligible = campaign.channel === "EMAIL" && (campaign.purpose ?? "MARKETING") === "MARKETING";
  return {
    enabled: eligible && raw.enabled !== false,
    firstGapMinutes: int(raw.firstGapMinutes, 0, 720, d.firstGapMinutes),
    waveGapMinutes: int(raw.waveGapMinutes, 15, 240, d.waveGapMinutes),
    restSlices: int(raw.restSlices, 1, 12, d.restSlices),
    engagedDays: int(raw.engagedDays, 30, 730, d.engagedDays),
    recentDonorDays: int(raw.recentDonorDays, 30, 1095, d.recentDonorDays),
    holdSpamRatePct: int(raw.holdSpamRatePct, 1, 50, d.holdSpamRatePct),
    holdMinSample: int(raw.holdMinSample, 50, 10_000, d.holdMinSample),
  };
}

export type Wave = 1 | 2 | 3 | 4;
const DAY = 864e5;
export function waveFor(input: { lastEngagedAt: Date | null; lastPaidAt: Date | null; now: Date; cfg: StagedConfig }): Wave {
  const { lastEngagedAt: e, lastPaidAt: p, now, cfg } = input;
  const within = (d: Date | null, days: number) => Boolean(d && now.getTime() - d.getTime() <= days * DAY);
  if (within(e, cfg.engagedDays) || within(p, cfg.engagedDays)) return 1;
  if (within(p, cfg.recentDonorDays)) return 2;
  if (e) return 3;
  return 4;
}

/** Stable 0..n-1 slice from the recipient's cursor id, so a resume never reshuffles anyone. */
export function sliceOf(cursorId: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < cursorId.length; i++) h = Math.imul(h ^ cursorId.charCodeAt(i), 16777619);
  return (h >>> 0) % Math.max(1, n);
}

/** When this recipient may receive the campaign; null = now (wave 1). */
export function releaseAt(wave: Wave, cursorId: string, startedAt: Date, cfg: StagedConfig): Date | null {
  if (wave === 1) return null;
  const base = startedAt.getTime() + cfg.firstGapMinutes * 60_000, gap = cfg.waveGapMinutes * 60_000;
  const offset = wave === 2 ? 0 : wave === 3 ? gap : 2 * gap + sliceOf(cursorId, cfg.restSlices) * gap;
  return new Date(base + offset);
}

/** Last wave's release relative to start, for the "expected finish" estimate in the UI. */
export function lastWaveOffsetMinutes(cfg: StagedConfig): number {
  return cfg.firstGapMinutes + (cfg.restSlices + 1) * cfg.waveGapMinutes;
}

/** Spam / reputation rejections (not invalid or unsubscribed contacts, not temporary throttling). */
export const SPAM_BLOCK_RE = /spam|blacklist|blocklist|block(ed)?\b|reputation|account problem/i;
export const NOT_SPAM_RE = /contact'?s status was|unsubscribed|invalid/i;
export function isSpamBlock(message: string | null | undefined): boolean {
  return Boolean(message && SPAM_BLOCK_RE.test(message) && !NOT_SPAM_RE.test(message));
}
export function shouldHold(input: { processed: number; spamBlocked: number; cfg: StagedConfig }): boolean {
  return input.processed >= input.cfg.holdMinSample && (input.spamBlocked / input.processed) * 100 >= input.cfg.holdSpamRatePct;
}
