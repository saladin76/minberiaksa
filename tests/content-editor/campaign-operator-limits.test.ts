import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { runSuggestionBatch } from "../../lib/content-editor/suggestion-batch";
type Module = { campaignSendControls: (row: { metadata: unknown }) => { dailyCap: number; dailyCapEnabled: boolean }; evaluateCampaignSendControls: (row: { channel: string; metadata: unknown }) => Promise<{ ok: boolean; remainingDaily: number | null }> };
test("campaigns have no default internal daily ceiling; only an explicitly enabled operator cap limits sends", async () => {
  let capacityReads = 0;
  const loaded = { exports: {} as Module };
  const dependencies: Record<string, unknown> = { "server-only": {}, "@/lib/prisma": { prisma: { communicationGlobalControl: { findUnique: async () => null }, communicationDelivery: { count: async () => { capacityReads++; return 3; } } } } };
  new vm.Script(ts.transpileModule(readFileSync("lib/communication/campaign-send-controls.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, process: { env: { COMMUNICATION_WHATSAPP_DAILY_CAP: "1" } }, require: (name: string) => dependencies[name] });
  for (const metadata of [{}, { sendControls: { dailyCap: 1 } }]) {
    assert.equal(loaded.exports.campaignSendControls({ metadata }).dailyCap, 0);
    const result = await loaded.exports.evaluateCampaignSendControls({ channel: "WHATSAPP", metadata });
    assert.equal(result.ok, true); assert.equal(result.remainingDaily, null);
  }
  assert.equal(capacityReads, 0);
  assert.equal((await loaded.exports.evaluateCampaignSendControls({ channel: "WHATSAPP", metadata: { sendControls: { dailyCap: 3, dailyCapEnabled: true } } })).ok, false);
  assert.equal(capacityReads, 1);
});
test("translation probes one language then uses at most three concurrent requests while retaining all results", async () => {
  const targets = ["en", "tr", "fr", "de", "ur", "ru"], releases = new Map<string, () => void>(), completed: string[] = [];
  let active = 0, maximum = 0;
  const task = runSuggestionBatch({ targets, signal: new AbortController().signal, request: async locale => { active++; maximum = Math.max(maximum, active); await new Promise<void>(resolve => releases.set(locale, resolve)); active--; return locale; }, onSuccess: locale => completed.push(locale), onError: () => assert.fail("unexpected failure"), onProgress() {} });
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  await flush(); assert.equal(releases.size, 1); releases.get("en")!();
  await flush(); assert.equal(active, 3); assert.equal(releases.size, 4);
  for (const locale of ["tr", "fr", "de"]) releases.get(locale)!();
  await flush(); for (const locale of ["ur", "ru"]) releases.get(locale)!();
  await task; assert.equal(maximum, 3); assert.deepEqual([...completed].sort(), [...targets].sort());
});
