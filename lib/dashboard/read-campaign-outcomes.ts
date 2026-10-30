import { readDashboardJson } from "./read-json";

function pause(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("CAMPAIGN_REPORT_ABORTED")); return; }
    const aborted = () => { clearTimeout(timer); reject(new Error("CAMPAIGN_REPORT_ABORTED")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

/** Read a complete financial snapshot; pending is a loading state, never zero. */
export async function readCampaignOutcomes<T extends { outcomesReady?: boolean }>(
  url: string,
  signal: AbortSignal,
  options: { read?: typeof readDashboardJson; wait?: typeof pause; now?: () => number; deadlineMs?: number } = {},
): Promise<T> {
  const read = options.read ?? readDashboardJson, wait = options.wait ?? pause, now = options.now ?? Date.now;
  const until = now() + (options.deadlineMs ?? 120_000);
  for (;;) {
    if (signal.aborted) throw new Error("CAMPAIGN_REPORT_ABORTED");
    const report = await read<T>(url, signal);
    if (report.outcomesReady !== false) return report;
    if (now() >= until) throw new Error("CAMPAIGN_REPORT_TIMEOUT");
    await wait(signal, 2_000);
  }
}
