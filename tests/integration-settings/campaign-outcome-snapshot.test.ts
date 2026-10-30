import test from "node:test";
import assert from "node:assert/strict";
import { fixtureModule } from "./gift-delivery-fixture";
import { readCampaignOutcomes } from "../../lib/dashboard/read-campaign-outcomes";
import type { CampaignOutcomeSummary } from "../../lib/communication/campaign-attribution-service";

const { createCampaignOutcomeSnapshotReader } = fixtureModule<typeof import("../../lib/communication/campaign-outcome-snapshot")>("lib/communication/campaign-outcome-snapshot.ts", {
  "./campaign-attribution-service": { getCampaignOutcomeSummary: async () => { throw new Error("not used"); } },
});
const result = (): CampaignOutcomeSummary => ({ metrics: new Map([["a", { donationCount: 1, revenue: 17, failedDonationCount: 0, unpricedPaidCount: 0 }]]), staticTrackingCampaignIds: [], unattributed: { donationCount: 0, revenue: 0, unpricedPaidCount: 0 } });
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test("polling and reordered campaign IDs share one complete scan; no partial zero is exposed", async () => {
  let calls = 0, finish!: (value: CampaignOutcomeSummary) => void, time = 1;
  const read = createCampaignOutcomeSnapshotReader(async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, () => time, 30);
  assert.equal(read(["b", "a", "a"]).ready, false); await settle();
  assert.equal(read(["a", "b"]).ready, false); assert.equal(calls, 1);
  finish(result()); await settle();
  const snapshot = read(["b", "a"]);
  assert.equal(snapshot.ready, true);
  if (snapshot.ready) assert.equal(snapshot.summary.metrics.get("a")?.revenue, 17);
  time = 32; assert.equal(read(["a", "b"]).ready, false); await settle(); assert.equal(calls, 2);
});
test("read failures remain unavailable and may be retried after the short error interval", async () => {
  let calls = 0, time = 1;
  const read = createCampaignOutcomeSnapshotReader(async () => { calls++; if (calls === 1) throw new Error("database unavailable"); return result(); }, () => time);
  assert.equal(read(["a"]).ready, false); await settle();
  assert.throws(() => read(["a"]), /READ_FAILED/);
  time = 5002; assert.equal(read(["a"]).ready, false); await settle(); assert.equal(read(["a"]).ready, true);
});
test("different audiences do not reuse a financial snapshot and pending scans cannot be evicted", async () => {
  const read = createCampaignOutcomeSnapshotReader(async () => new Promise(() => {}), () => 0, 30, 1);
  assert.equal(read(["a"]).ready, false);
  assert.throws(() => read(["b"]), /BUSY/);
  assert.equal(read(["a"]).ready, false);
});
test("Next keeps a newly started scan alive once, while later polls reuse it", async () => {
  const tracked: Promise<void>[] = [];
  const read = createCampaignOutcomeSnapshotReader(async () => result());
  read(["a"], work => tracked.push(work)); read(["a"], work => tracked.push(work));
  assert.equal(tracked.length, 1); await tracked[0]; assert.equal(read(["a"]).ready, true);
});
test("the client keeps pending income loading until the complete report arrives", async () => {
  let reads = 0, waits = 0;
  const response = await readCampaignOutcomes<{ outcomesReady: boolean; revenue?: number }>("/fixture", new AbortController().signal, {
    read: async <T>() => (++reads === 1 ? { outcomesReady: false } : { outcomesReady: true, revenue: 17 }) as T,
    wait: async () => { waits++; },
  });
  assert.equal(response.revenue, 17); assert.equal(reads, 2); assert.equal(waits, 1);
});
test("a changed page cancels polling and a stuck report has a visible finite deadline", async () => {
  const controller = new AbortController(); let time = 0;
  const read = async <T>() => ({ outcomesReady: false }) as T;
  await assert.rejects(readCampaignOutcomes("/fixture", controller.signal, { read, wait: async () => controller.abort() }), /ABORTED/);
  await assert.rejects(readCampaignOutcomes("/fixture", new AbortController().signal, { read, wait: async () => { time += 10; }, now: () => time, deadlineMs: 10 }), /TIMEOUT/);
});
