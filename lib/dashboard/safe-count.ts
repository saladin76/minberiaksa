/**
 * Read-failure-aware counting.
 *
 * The dashboard was littered with `prisma.x.count({...}).catch(() => 0)`. That pattern makes a
 * database outage, a Prisma validation error, or a schema drift render as **0** — visually
 * identical to a healthy, quiet system. "0 failed deliveries" and "0 campaigns awaiting
 * review" are exactly the numbers an operator trusts to mean "nothing needs me", so a broken
 * read produced false reassurance rather than an alarm.
 *
 * `safeCount` keeps the same non-throwing behaviour (these are dashboard reads; one broken
 * count must not 500 an entire page) but makes the failure **observable** in two ways:
 *   1. it logs the error with a caller-supplied label, so it appears in server logs, and
 *   2. it reports `ok: false`, so a caller that wants to show "—" or an error badge instead of
 *      a confident "0" now can.
 *
 * Callers that genuinely only need a number can use `safeCountValue`, which preserves the old
 * `0` fallback — but still logs, so the failure is no longer silent.
 */

export type SafeCount =
  | { ok: true; value: number }
  | { ok: false; value: 0; error: string };

/** Runs a count, never throws. Returns ok:false (and logs) when the read fails. */
export async function safeCount(label: string, run: () => Promise<number>): Promise<SafeCount> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Deliberately console.error, not a swallowed no-op: this is the whole point of the helper.
    console.error(`[safeCount] read failed for "${label}": ${message}`);
    return { ok: false, value: 0, error: message };
  }
}

/**
 * Same as `safeCount` but collapses to a plain number, matching the old `.catch(() => 0)`
 * shape. Use when the caller's response type cannot yet carry a failure flag — the failure is
 * still logged rather than discarded.
 */
export async function safeCountValue(label: string, run: () => Promise<number>): Promise<number> {
  return (await safeCount(label, run)).value;
}
