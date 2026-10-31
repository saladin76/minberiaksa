import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
// Each fixture is isolated from production, providers and donor contacts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = Record<string, any>;
function load(file: string, deps: Value) {
  const loaded = { exports: {} as Value };
  new vm.Script(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, Date, Map, Set, process: { env: { DATABASE_URL: "fixture" } }, console: { error() {} }, require: (key: string) => { assert.ok(key in deps, key); return deps[key]; } });
  return loaded.exports;
}
function transitionHarness(options: { missing?: boolean; denied?: boolean; failRead?: boolean; status?: string } = {}) {
  const state = { status: options.status ?? "DRAFT", writes: 0, reads: 0 };
  const route = load("app/api/communication/campaigns/[id]/transition/route.ts", {
    "next/server": { NextResponse: { json: (body: Value, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } }, zod: { z },
    "next-auth": { getServerSession: async () => ({ user: { id: "operator", role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => options.denied ? { status: 403 } : null },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorId: "operator" }) },
    "@/lib/communication/campaign-service": { getCampaign: async () => ({ status: state.status }), transitionCampaign: async (_id: string, action: string) => { state.writes++; state.status = action === "SUBMIT_REVIEW" ? "REVIEW" : "APPROVED"; return { ok: true, data: { status: state.status } }; } },
    "@/lib/communication/campaign-approval-service": { evaluateCoverageGate: async () => { state.reads++; if (options.failRead) throw new Error("AUDIENCE_DATABASE_UNAVAILABLE"); return { ok: !options.missing, undecided: options.missing ? ["fr"] : [], missingWithRecipients: options.missing ? [{ locale: "fr", label: "Français", recipientCount: 41 }] : [] }; } },
  });
  return { state, run: (action = "CONFIRM") => route.POST({ json: async () => ({ action }) }, { params: Promise.resolve({ id: "campaign" }) }) };
}
test("confirmation checks every audience language before changing draft/review status, including a language absent from the first batch", async () => {
  for (const action of ["CONFIRM", "APPROVE", "SCHEDULE"]) {
    const h = transitionHarness({ missing: true }); const result = await h.run(action);
    assert.equal(result.status, 409); assert.equal(result.body.code, "LANGUAGE_COVERAGE_INCOMPLETE");
    assert.equal(result.body.coverage.missingWithRecipients[0].recipientCount, 41);
    assert.equal(h.state.writes, 0); assert.equal(h.state.status, "DRAFT");
  }
});
test("one operator still confirms once when all languages are covered; authorization/read failure cannot approve", async () => {
  const ready = transitionHarness(); assert.equal((await ready.run()).status, 200); assert.equal(ready.state.status, "APPROVED"); assert.equal(ready.state.reads, 1);
  const denied = transitionHarness({ denied: true }); assert.equal((await denied.run()).status, 403); assert.equal(denied.state.reads, 0);
  const failed = transitionHarness({ failRead: true }); assert.equal((await failed.run()).status, 503); assert.equal(failed.state.writes, 0);
});

function recoveryHarness(options: { missing?: boolean; status?: string; done?: boolean; liveLease?: boolean; race?: boolean; gateFails?: boolean; controls?: boolean } = {}) {
  const progress = { cursor: "saved-cursor", total: 500, sent: 286, skipped: 183, failed: 31, batches: 2, blockedRuns: 3, done: options.done ?? false, reasons: { SENT: 286 } };
  const state = { campaign: { id: "campaign", name: "Fixture", channel: "WHATSAPP", templateGroupId: "template", status: options.status ?? "BLOCKED", updatedAt: new Date(1), metadata: { sendProgress: progress, sendControls: { dailyCap: 0 }, lastRun: { blocked: "LANGUAGE_COVERAGE_INCOMPLETE" }, sendLease: options.liveLease ? { expiresAt: new Date(Date.now() + 60000).toISOString() } : null } }, writes: 0, audits: [] as Value[] };
  const runtime = load("lib/communication/communication-runtime-types.ts", {});
  const service = load("lib/communication/campaign-recovery.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: { communicationCampaign: { updateMany: async ({ where, data }: Value) => {
      if (options.race) state.campaign.status = "CANCELLED";
      if (state.campaign.status !== where.status || state.campaign.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      state.writes++; Object.assign(state.campaign, data); return { count: 1 };
    } } } },
    "./campaign-service": { getCampaign: async () => structuredClone(state.campaign) },
    "./campaign-approval-service": { evaluateCoverageGate: async () => { if (options.gateFails) throw new Error("DB_UNAVAILABLE"); return { ok: !options.missing, missingWithRecipients: options.missing ? [{ locale: "fr", label: "Français", recipientCount: 41 }] : [], undecided: options.missing ? ["fr"] : [] }; } },
    "./campaign-send-controls": { evaluateCampaignSendControls: async () => options.controls ? { ok: false, reason: "PAUSED", controls: { dailyCap: 0 } } : { ok: true, controls: { dailyCap: 0 } } },
    "./campaign-send-planner": { planCampaignSend: async () => ({}) },
    "./communication-runtime-types": runtime,
    "@/lib/audit-log": { writeAuditLog: async (row: Value) => state.audits.push(row) },
  });
  return { state, service, inspect: () => service.inspectCampaignRecovery("campaign"), resume: () => service.queueCampaignRecovery("campaign", { actorId: "operator", actorRole: "ADMIN" }) };
}
test("a blocked campaign with missing translations is diagnosed without resetting progress or starting messages", async () => {
  const h = recoveryHarness({ missing: true }); const read = await h.inspect();
  assert.equal(read.ok, true); assert.equal(read.data.canResume, false); assert.equal(read.data.blocked, "LANGUAGE_COVERAGE_INCOMPLETE");
  assert.equal((await h.resume()).status, 409); assert.equal(h.state.writes, 0); assert.equal(h.state.campaign.metadata.sendProgress.cursor, "saved-cursor");
});
test("after translations are ready a recovery queues the saved cursor once and retains controls/history without provider calls", async () => {
  const h = recoveryHarness(); const before = structuredClone(h.state.campaign.metadata.sendProgress);
  assert.equal((await h.resume()).ok, true); assert.equal(h.state.campaign.status, "SENDING");
  assert.equal(h.state.campaign.metadata.sendProgress.cursor, before.cursor); assert.equal(h.state.campaign.metadata.sendProgress.sent, before.sent);
  assert.equal(h.state.campaign.metadata.sendProgress.blockedRuns, 0); assert.equal(h.state.campaign.metadata.sendProgress.done, false);
  assert.equal(h.state.campaign.metadata.sendControls.dailyCap, 0); assert.equal(h.state.audits[0].metadata.providerCalls, 0);
  assert.equal((await h.resume()).ok, false); assert.equal(h.state.writes, 1);
});
test("recovery cannot revive completed/cancelled work, override live leases or race cancellation", async () => {
  for (const options of [{ done: true }, { status: "ARCHIVED" }, { status: "CANCELLED" }, { liveLease: true }, { race: true }, { controls: true }]) {
    const h = recoveryHarness(options); assert.equal((await h.resume()).ok, false); assert.equal(h.state.writes, 0); assert.equal(h.state.audits.length, 0);
  }
  const failed = recoveryHarness({ gateFails: true }); await assert.rejects(failed.resume); assert.equal(failed.state.writes, 0);
});

test("live counter aggregation is scoped, validates database output and never writes campaign state", async () => {
  const id = "a".repeat(24), empty = "b".repeat(24); let query: Value | null = null;
  const expected = { total: 4451, sent: 4196, delivered: 2508, read: 1207, clicked: 0, replied: 25, failed: 1645, skipped: 222, unsubscribed: 0 };
  let response: unknown = [{ _id: { $oid: id }, ...expected }];
  const service = load("lib/communication/campaign-counter-service.ts", { "@/lib/prisma": { prisma: { communicationDelivery: { aggregateRaw: async (input: Value) => { query = input; return response; } } } } });
  const result = await service.readCampaignDeliveryCounters([id, id, empty]);
  assert.equal(JSON.stringify(result.get(id)), JSON.stringify(expected)); assert.equal(result.get(empty).total, 0);
  assert.equal((query! as Value).options.maxTimeMS, 15000);
  assert.equal(JSON.stringify((query! as Value).pipeline[0]), JSON.stringify({ $match: { campaignId: { $in: [{ $oid: id }, { $oid: empty }] } } }));
  for (const bad of [null, [{ _id: { $oid: id }, ...expected, sent: -1 }], [{ _id: { $oid: empty }, ...expected, failed: "unknown" }]]) {
    response = bad; await assert.rejects(service.readCampaignDeliveryCounters([id, empty]));
  }
  await assert.rejects(service.readCampaignDeliveryCounters(["invalid"]));
});

test("recovery HTTP endpoints authorize before inspection or requeue and require explicit confirmation", async () => {
  let denied = true, inspections = 0, writes = 0;
  const route = load("app/api/communication/campaigns/[id]/recovery/route.ts", {
    "next/server": { NextResponse: { json: (body: Value, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: "operator" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => denied ? { status: 403 } : null },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorId: "operator" }) },
    "@/lib/communication/campaign-recovery": { inspectCampaignRecovery: async () => { inspections++; return { ok: true, data: {} }; }, queueCampaignRecovery: async () => { writes++; return { ok: true, data: { queued: true } }; } },
  });
  const params = { params: Promise.resolve({ id: "campaign" }) };
  assert.equal((await route.GET({}, params)).status, 403);
  assert.equal((await route.POST({ json: async () => ({ confirm: true }) }, params)).status, 403); assert.equal(inspections + writes, 0);
  denied = false;
  assert.equal((await route.POST({ json: async () => ({}) }, params)).status, 400); assert.equal(writes, 0);
  assert.equal((await route.GET({}, params)).status, 200); assert.equal(inspections, 1); assert.equal(writes, 0);
  assert.equal((await route.POST({ json: async () => ({ confirm: true }) }, params)).status, 200); assert.equal(writes, 1);
});
