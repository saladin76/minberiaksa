import { getCampaignOutcomeSummary, type CampaignOutcomeSummary } from "./campaign-attribution-service";

type Snapshot<T> = { ready: false } | { ready: true; computedAt: string; summary: T };
type Entry<T> = { startedAt: number; finishedAt?: number; summary?: T; failed?: boolean; error?: unknown };

/** Long lifetime reports outlive a short browser request. Coalesce their reads
 * and let the UI poll a small authenticated response until the full scan settles.
 * Never expose partial counters, cache an error as zero, or serve stale income. */
export function createCampaignOutcomeSnapshotReader<T = CampaignOutcomeSummary>(
  load: (ids: readonly string[]) => Promise<T>,
  now: () => number = Date.now,
  ttlMs = 30_000,
  maxEntries = 4,
) {
  const entries = new Map<string, Entry<T>>();
  return function read(ids: readonly string[], keepAlive?: (work: Promise<void>) => void, revision?: string): Snapshot<T> {
    const normalized = [...new Set(ids)].sort();
    const key = JSON.stringify(revision === undefined ? normalized : [normalized, revision]), time = now();
    let entry = entries.get(key);
    if (entry?.finishedAt !== undefined && time - entry.finishedAt >= (entry.failed ? 5_000 : ttlMs)) {
      entries.delete(key); entry = undefined;
    }
    if (entry?.failed) throw entry.error ?? new Error("CAMPAIGN_OUTCOMES_READ_FAILED");
    if (entry?.summary && entry.finishedAt !== undefined) return { ready: true, computedAt: new Date(entry.finishedAt).toISOString(), summary: entry.summary };
    if (entry) return { ready: false };
    // Remove only settled work; a refresh must never duplicate an in-flight scan.
    if (entries.size >= maxEntries) {
      for (const [oldKey, oldEntry] of entries) if (oldEntry.finishedAt !== undefined) { entries.delete(oldKey); break; }
      if (entries.size >= maxEntries) throw new Error("CAMPAIGN_OUTCOMES_BUSY");
    }
    const next: Entry<T> = { startedAt: time }; entries.set(key, next);
    const work = Promise.resolve().then(() => load(normalized)).then(
      summary => { next.summary = summary; next.finishedAt = now(); },
      error => { next.failed = true; next.error = error; next.finishedAt = now(); },
    );
    keepAlive?.(work);
    return { ready: false };
  };
}

export const getCampaignOutcomeSnapshot = createCampaignOutcomeSnapshotReader(getCampaignOutcomeSummary);
