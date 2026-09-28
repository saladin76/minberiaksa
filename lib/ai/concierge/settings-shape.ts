/**
 * The concierge's dashboard settings (`GlobalSettings.aiConcierge`), shared by
 * the server loader, the settings API and the dashboard form. Plain data: no
 * server imports, so client components can use the shape and the defaults.
 *
 * Every field is optional in storage; `sanitizeConciergeSettings` fills the
 * gaps from `DEFAULT_CONCIERGE_SETTINGS`, so a row written before a field
 * existed reads as "the default".
 */

export interface ConciergeSettings {
  /** Master switch: off hides the launcher and the in-page entries. */
  enabled: boolean;
  /** The small bubble beside the launcher inviting a visitor to try it. */
  teaserEnabled: boolean;
  /** Seconds on a page before the bubble appears. */
  teaserDelaySeconds: number;
  /** Soft pulse ring around the launcher until it is first opened. */
  pulseEnabled: boolean;
  /** Off answers every message from the deterministic path (no model call). */
  llmEnabled: boolean;
  /** Keep the transcript of each conversation for the dashboard. */
  storeTranscripts: boolean;
  /** Days after a chat in which a signed-in donor's donation counts as indirect. */
  attributionWindowDays: number;
  /**
   * Notes the model may use when answering, written by the team: a current
   * appeal to mention, a fact missing from the FAQ, a tone instruction.
   */
  teamNotes: string;
}

export const DEFAULT_CONCIERGE_SETTINGS: ConciergeSettings = {
  enabled: true,
  teaserEnabled: true,
  teaserDelaySeconds: 6,
  pulseEnabled: true,
  llmEnabled: true,
  storeTranscripts: true,
  attributionWindowDays: 7,
  teamNotes: "",
};

export const TEAM_NOTES_MAX = 2000;

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function sanitizeConciergeSettings(raw: unknown): ConciergeSettings {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CONCIERGE_SETTINGS;
  return {
    enabled: bool(o.enabled, d.enabled),
    teaserEnabled: bool(o.teaserEnabled, d.teaserEnabled),
    teaserDelaySeconds: int(o.teaserDelaySeconds, d.teaserDelaySeconds, 0, 120),
    pulseEnabled: bool(o.pulseEnabled, d.pulseEnabled),
    llmEnabled: bool(o.llmEnabled, d.llmEnabled),
    storeTranscripts: bool(o.storeTranscripts, d.storeTranscripts),
    attributionWindowDays: int(o.attributionWindowDays, d.attributionWindowDays, 1, 90),
    teamNotes: typeof o.teamNotes === "string" ? o.teamNotes.slice(0, TEAM_NOTES_MAX) : d.teamNotes,
  };
}

/** What the public launcher needs — nothing else leaves the server. */
export interface PublicConciergeConfig {
  enabled: boolean;
  teaser: boolean;
  teaserDelaySeconds: number;
  pulse: boolean;
}

export function publicConciergeConfig(s: ConciergeSettings): PublicConciergeConfig {
  return { enabled: s.enabled, teaser: s.teaserEnabled, teaserDelaySeconds: s.teaserDelaySeconds, pulse: s.pulseEnabled };
}
