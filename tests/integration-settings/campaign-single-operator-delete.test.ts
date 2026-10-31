import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { canDeleteUnsentCampaign } from "../../lib/communication/campaign-lifecycle";
import { isCommunicationChannel } from "../../lib/communication/communication-runtime-types";
// Dynamic database records exist only in this isolated, non-sending fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const id = "507f1f77bcf86cd799439011", actor = { actorId: "507f1f77bcf86cd799439012", actorRole: "ADMIN" };
function harness(options: { status?: string; channel?: string; deliveries?: number; countFails?: boolean; cleanupFails?: boolean; sendWins?: boolean; transitionRace?: boolean; sent?: number; metadata?: Row } = {}) {
  const state: Row = { campaign: { id, name: "Fixture campaign", channel: options.channel || "EMAIL", status: options.status || "REVIEW", updatedAt: new Date(1), sentCount: options.sent || 0, deliveredCount: 0, readCount: 0, failedCount: 0, repliedCount: 0, clickedCount: 0, metadata: options.metadata || {} }, deferred: 2, trackingStatus: "ACTIVE" };
  const audits: Row[] = []; let audienceReads = 0;
  function models(target: Row) {
    return {
      communicationCampaign: {
        findUnique: async () => structuredClone(target.campaign),
        findUniqueOrThrow: async () => { assert.ok(target.campaign); return structuredClone(target.campaign); },
        updateMany: async ({ where, data }: Row) => {
          if (options.transitionRace) { target.campaign.status = "CANCELLED"; target.campaign.updatedAt = new Date(2); }
          if (!target.campaign || target.campaign.status !== where.status || target.campaign.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
          Object.assign(target.campaign, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), { updatedAt: new Date(2) }); return { count: 1 };
        },
        deleteMany: async ({ where }: Row) => {
          if (options.sendWins) { state.campaign.status = "SENDING"; state.campaign.updatedAt = new Date(3); return { count: 0 }; }
          assert.equal(where.id, id); assert.equal(where.sentCount, 0); assert.equal(where.failedCount, 0);
          if (!target.campaign || target.campaign.status !== where.status || target.campaign.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
          target.campaign = null; return { count: 1 };
        },
      },
      communicationDelivery: { count: async () => { if (options.countFails) throw new Error("DB_UNAVAILABLE"); return options.deliveries || 0; } },
      communicationCampaignDeferredRecipient: { deleteMany: async () => { if (options.cleanupFails) throw new Error("QUEUE_WRITE_FAILED"); target.deferred = 0; return { count: 2 }; } },
      communicationCampaignTrackingLink: { updateMany: async ({ data }: Row) => { assert.equal(data.status, "ARCHIVED"); target.trackingStatus = data.status; return { count: 1 }; } },
    };
  }
  const prisma = { ...models(state), $transaction: async (work: (db: Row) => Promise<unknown>) => {
    const snapshot = structuredClone(state), observed = state.campaign?.updatedAt?.getTime();
    const result = await work(models(snapshot));
    if (state.campaign?.updatedAt?.getTime() !== observed) throw Object.assign(new Error("Conflict"), { code: "P2034" });
    state.campaign = snapshot.campaign; state.deferred = snapshot.deferred; state.trackingStatus = snapshot.trackingStatus; return result;
  } };
  const deps: Row = {
    "./template-usage": {}, "@/lib/prisma": { prisma }, "@/lib/audit-log": { writeAuditLog: async (row: Row) => { audits.push(row); } },
    "./communication-runtime-types": { isCommunicationChannel }, "./campaign-lifecycle": { canDeleteUnsentCampaign },
    "./campaign-recipient-service": { getRecipientBreakdown: async () => { audienceReads++; return { totals: { eligible: 25000 } }; } },
  };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("lib/communication/campaign-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, Date, process: { env: { DATABASE_URL: "fixture", COMMUNICATION_FOUR_EYES_MIN_RECIPIENTS: "1" } }, console: { error() {} }, require: (key: string) => { assert.ok(key in deps, key); return deps[key]; } });
  return { approve: () => loaded.exports.transitionCampaign(id, "APPROVE", { actor }), remove: () => loaded.exports.deleteUnsentCampaign(id, actor), state: () => state, audits, audienceReads: () => audienceReads };
}
test("one operator can approve EMAIL, WHATSAPP and SMS regardless of the retired second-approver environment flag", async () => {
  for (const channel of ["EMAIL", "WHATSAPP", "SMS"]) {
    const h = harness({ channel }); assert.equal((await h.approve()).ok, true);
    assert.equal(h.state().campaign.status, "APPROVED"); assert.equal(h.state().campaign.approvedBy, actor.actorId);
    assert.equal(h.audits[0].actorId, actor.actorId); assert.equal(h.audienceReads(), 0);
  }
});
test("approval cannot overwrite a concurrent cancellation", async () => {
  const h = harness({ transitionRace: true }); const result = await h.approve();
  assert.equal(result.status, 409); assert.equal(h.state().campaign.status, "CANCELLED"); assert.equal(h.audits.length, 0);
});
test("unsent drafts, review, approved, scheduled and cancelled campaigns delete with pending work while tracking evidence remains", async () => {
  for (const status of ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "CANCELLED", "FAILED", "BLOCKED"]) {
    const h = harness({ status }); const result = await h.remove();
    assert.equal(result.ok, true, status); assert.equal(result.data.deleted, true);
    assert.equal(h.state().campaign, null); assert.equal(h.state().deferred, 0); assert.equal(h.state().trackingStatus, "ARCHIVED");
    assert.equal(h.audits[0].metadata.deliveryHistoryRemoved, false);
  }
});
test("a delivery-history read failure never authorizes deletion and cleanup failure rolls everything back", async () => {
  for (const options of [{ countFails: true }, { cleanupFails: true }]) {
    const h = harness(options); const result = await h.remove();
    assert.equal(result.ok, false); assert.equal(result.status, 503);
    assert.ok(h.state().campaign); assert.equal(h.state().deferred, 2); assert.equal(h.state().trackingStatus, "ACTIVE"); assert.equal(h.audits.length, 0);
  }
});
test("sending, sent counters, existing deliveries, progress and leases preserve the campaign and its complete history", async () => {
  for (const options of [{ status: "SENDING" }, { status: "SENT" }, { status: "ARCHIVED" }, { sent: 1 }, { deliveries: 1 }, { metadata: { sendLease: { token: "inflight" } } }, { metadata: { sendProgress: { sent: 0, done: false } } }]) {
    const h = harness(options); const result = await h.remove();
    assert.equal(result.status, 409); assert.ok(h.state().campaign); assert.equal(h.state().trackingStatus, "ACTIVE"); assert.equal(h.audits.length, 0);
  }
});
test("a send claim winning the race aborts deletion; two delete requests cannot both succeed", async () => {
  const race = harness({ status: "SCHEDULED", sendWins: true }); assert.equal((await race.remove()).status, 409); assert.equal(race.state().campaign.status, "SENDING");
  const twice = harness(); const results = await Promise.all([twice.remove(), twice.remove()]);
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(twice.audits.length, 1);
});
