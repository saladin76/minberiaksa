import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { recipientExclusionReason } from "../../lib/communication/campaign-audience-accounting";
import { normalizeCampaignContact } from "../../lib/communication/campaign-contact-validation";

type Dict = Record<string, unknown>;
function isolated<T>(file: string, dependencies: Dict, append = ""): T {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new vm.Script(output + append, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports, Date, Error,
    process: { env: { DATABASE_URL: "mongodb://127.0.0.1/isolated", COMMUNICATION_EMAIL_CONCURRENCY: "2" } },
    require: (id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return loaded.exports as T;
}
const clone = <T>(value: T): T => structuredClone(value);
type Progress = { cursor: string | null; total: number; sent: number; skipped: number; failed: number; done: boolean; batches: number; blockedRuns: number; reasons: Record<string, number>; startedAt: string; updatedAt: string };
type State = { id: string; name: string; status: string; channel: string; purpose: string; templateGroupId: string; audienceSegmentKey: null; scheduledAt: Date; metadata: Dict };
type Recipient = { cursorId: string; userId: string; name: string; email: string; phone: string; locale: string; country: string };
type Delivery = Dict & { id: string; status: string; recipientUserId: string; recipientEmail?: string; recipientPhone?: string; providerMessageId?: string; errorMessage?: string };
type Options = { size?: number; resumeAtEnd?: boolean; allSkipped?: boolean; failSkip?: boolean; failCreate?: boolean; failSentArchive?: boolean; failContext?: boolean; failQueueCount?: boolean; failQueueDelete?: boolean; failFinal?: boolean; cancelAtFinal?: boolean; pauseAtWorker?: boolean; guardBlocks?: boolean; sendThrows?: boolean; quiet?: boolean; duplicateContact?: boolean; failCounter?: boolean };
type Result = { ok: boolean; status: string; sent: number; skipped: number; failed: number; total: number; hasMore?: boolean; blocked?: string };
type Engine = {
  executeCampaignSend: (id: string, opts?: { mode?: string; maxBatches?: number; batchSize?: number; timeBudgetMs?: number }) => Promise<Result>;
  __test: { mapWithConcurrency: <T,R>(items: T[], limit: number, work: (item: T) => Promise<R>) => Promise<R[]> };
};
function engineHarness(options: Options = {}) {
  const recipients: Recipient[] = Array.from({ length: options.size ?? 2 }, (_, i) => ({
    cursorId: String(i + 1).padStart(3, "0"), userId: `u${i}`, name: `Donor ${i}`, email: options.duplicateContact ? "same@example.test" : `u${i}@example.test`, phone: `+90555111${String(i).padStart(4, "0")}`, locale: "en", country: "TR",
  }));
  const now = new Date().toISOString();
  const previous: Progress = { cursor: recipients.at(-1)?.cursorId ?? null, total: recipients.length, sent: recipients.length, skipped: 0, failed: 0, done: false, batches: 1, blockedRuns: 0, reasons: {}, startedAt: now, updatedAt: now };
  const campaign: State = { id: "campaign", name: "Test", status: options.resumeAtEnd ? "SENDING" : "APPROVED", channel: "EMAIL", purpose: "MARKETING", templateGroupId: "template", audienceSegmentKey: null, scheduledAt: new Date(0), metadata: options.resumeAtEnd ? { sendProgress: previous } : {} };
  const deliveries: Delivery[] = options.resumeAtEnd ? recipients.map((r, i) => ({ id: `d${i}`, status: "SENT", recipientUserId: r.userId, recipientEmail: r.email, providerMessageId: `p${i}` })) : [];
  let queue: Array<Recipient & { id: string; nextAttemptAt: Date }> = [];
  let calls = 0, gates = 0, creates = 0;
  const checkpoints: Array<{ status: string; metadata: Dict; options: Dict }> = [];
  const events: string[] = [];
  function mutate(_id: string, fn: (current: Dict) => Dict | null, config: { status?: string; expectedStatus?: string } = {}) {
    if (config.status && config.status !== "SENDING" && options.cancelAtFinal) campaign.status = "CANCELLED";
    if (config.expectedStatus && campaign.status !== config.expectedStatus) return false;
    const next = fn(clone(campaign.metadata));
    if (!next) return false;
    if (config.status && config.status !== "SENDING" && options.failFinal) return false;
    if (config.status) campaign.status = config.status;
    campaign.metadata = clone(next);
    checkpoints.push({ status: campaign.status, metadata: clone(next), options: clone(config) });
    return true;
  }
  const controls = () => ({ speedMode: "BALANCED", autoSpeed: false, priority: "NORMAL", scheduledStopAt: null,
    quietHours: { enabled: !!options.quiet, timezoneMode: "RECIPIENT", timezone: "Europe/Istanbul" } });
  const counter = isolated<{ computeFinalStatus: (total: number, sent: number, skipped: number, failed: number) => string }>("lib/communication/campaign-counter-service.ts", { "@/lib/prisma": { prisma: {} } });
  const engine = isolated<Engine>("lib/communication/campaign-send-executor.ts", {
    "@/lib/prisma": { prisma: {
      communicationCampaignDeferredRecipient: {
        count: async () => { if (options.failQueueCount) throw new Error("QUEUE_READ_FAILED"); return queue.length; },
        findMany: async () => clone(queue.filter((row) => row.nextAttemptAt <= new Date())),
        upsert: async (input: { create: Recipient & { nextAttemptAt: Date } }) => { if (!queue.some((row) => row.cursorId === input.create.cursorId)) queue.push({ ...input.create, id: `q-${input.create.cursorId}` }); return {}; },
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => { if (options.failQueueDelete) throw new Error("QUEUE_DELETE_FAILED"); const count = queue.length; queue = []; return { count }; },
      },
      communicationDelivery: { findMany: async () => clone([...deliveries].reverse()) },
    } },
    "@/lib/audit-log": { writeAuditLog: async () => {} },
    "./campaign-service": { getCampaign: async () => clone(campaign) },
    "./campaign-send-planner": { planCampaignSend: async (_id: string, opts: { cursor?: string | null; batchSize: number }) => {
      const page = recipients.filter((row) => !opts.cursor || row.cursorId > opts.cursor).slice(0, opts.batchSize);
      const skippedList = options.allSkipped ? page.map((r) => ({ cursorId: r.cursorId, userId: r.userId, locale: r.locale, reason: "DO_NOT_CONTACT" })) : [];
      return { campaignId: "campaign", channel: "EMAIL", status: campaign.status, total: page.length, audienceTotal: recipients.length,
        recipients: options.allSkipped ? [] : page, skippedList, eligible: options.allSkipped ? 0 : page.length, skipped: skippedList.length,
        reasons: {}, coverage: { ok: true, undecided: [] }, providerReady: true, senderReady: true, willSend: true,
        nextCursor: page.at(-1)?.cursorId ?? opts.cursor ?? null, exhausted: page.length < opts.batchSize, truncated: page.length >= opts.batchSize,
        ...(page.length ? {} : { blocked: "AUDIENCE_EXHAUSTED" }) };
    } },
    "./template-compat": { renderChannelTemplate: async () => ({ templateName: "template", subject: "Subject", body: "Body", usedFallback: false }) },
    "@/lib/templates/variables": { loadContextsForUserIds: async (ids: string[]) => { if (options.failContext) throw new Error("CONTEXT_READ_FAILED"); return new Map(ids.map((id) => [id, { user: { name: id } }])); } },
    "./update-campaign": { sourceUpdateOf: () => null, loadUpdateSource: async () => null, updateContextFor: () => ({}) },
    "./delivery-log-service": {
      createDeliveryRecord: async (input: Dict) => { creates++; if (options.failCreate) return { ok: false }; const id = `new-${deliveries.length}`; deliveries.push({ ...input, id } as Delivery); events.push("archive"); return { ok: true, data: { id } }; },
      recordSkippedDelivery: async (input: Dict, reason: string) => { if (options.failSkip) return { ok: false }; const id = `skip-${deliveries.length}`; deliveries.push({ ...input, id, status: "SKIPPED", errorMessage: reason } as Delivery); return { ok: true, data: { id } }; },
      markDeliveryStatus: async (id: string, status: string, patch: Dict) => { if (options.failSentArchive && status === "SENT") return { ok: false }; Object.assign(deliveries.find((d) => d.id === id)!, patch, { status }); return { ok: true, data: { id } }; },
      updateDeliveryVariables: async () => ({ ok: true }),
    },
    "./provider-router": { resolveProviderForSendWithRuntime: () => ({ canSend: true, providerId: "ELASTIC_EMAIL" }),
      sendPreparedDelivery: async () => { calls++; events.push("send"); if (options.sendThrows) throw new Error("socket error"); return { ok: true, providerMessageId: `p-${calls}`, internalAccepted: false }; } },
    "./providers/email/client": { EMAIL_PROVIDER_ID: "ELASTIC_EMAIL" },
    "./runtime-config": { getActiveCommunicationRuntimeBundle: async () => ({}) },
    "./sender-resolution": { loadSenderRoutingSnapshot: async () => ({}), resolveSenderFromSnapshot: () => ({ ok: true, sender: { id: "sender", senderEmail: "sender@example.test" } }) },
    "./whatsapp-template-sync": {}, "./providers/meta-whatsapp/parameters": {}, "./whatsapp-rendered-preview": {},
    "./audience-list-service": { resolveAudienceOrigin: async () => "CAMPAIGN" },
    "./campaign-counter-service": { ...counter, recomputeCampaignCounters: async () => ({ ok: !options.failCounter, status: campaign.status }) },
    "./campaign-send-controls": { autoSpeedMode: () => "BALANCED", campaignPriorityRank: () => 1, campaignSendControls: controls,
      evaluateCampaignSendControls: async () => { gates++; return options.pauseAtWorker && gates >= 3 ? { ok: false, reason: "PAUSED" } : { ok: true, controls: controls(), remainingDaily: null }; },
      insideQuietHours: () => !!options.quiet, speedSettings: () => ({ batchSize: 100, concurrency: 2 }) },
    "./campaign-metadata-store": { mutateCampaignMetadata: async (...args: Parameters<typeof mutate>) => mutate(...args),
      mergeCampaignMetadata: async (id: string, patch: Dict, config: { status?: string; expectedStatus?: string }) => { assert.equal(config.status, "SENDING"); assert.ok(patch.sendLease); return mutate(id, (current) => ({ ...current, ...patch }), config); } },
    "./phone": { phoneMatchVariants: (phone: string) => [phone] },
    "./campaign-contact-validation": { normalizeCampaignContact },
    "./campaign-recipient-guard": { checkCampaignRecipientBeforeSend: async (_channel: string, _id: string, contact: string) => { events.push("guard"); return options.guardBlocks ? { ok: false, reason: "DO_NOT_CONTACT" } : { ok: true, contact }; } },
    "@/lib/locales": { DEFAULT_LOCALE: "ar", isValidLocale: (value: string) => ["ar", "en"].includes(value) },
    "./recipient-timezone": { recipientTimeZone: () => "Europe/Istanbul" },
  }, "\nexports.__test = { mapWithConcurrency };\n");
  function expireLease() { const lease = campaign.metadata.sendLease as { expiresAt: string } | undefined; if (lease) lease.expiresAt = new Date(0).toISOString(); }
  return { engine, campaign, deliveries, checkpoints, options, events, state: () => ({ calls, creates, queue: clone(queue) }), expireLease,
    releaseQuiet: () => { options.quiet = false; for (const row of queue) row.nextAttemptAt = new Date(0); } };
}

test("executor sends each recipient once and checkpoints done only with final status", async () => {
  const h = engineHarness(); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.ok, true); assert.equal(result.status, "SENT"); assert.equal(result.total, 2); assert.equal(result.sent, 2);
  assert.equal(h.state().calls, 2);
  for (const checkpoint of h.checkpoints.filter((row) => row.status === "SENDING")) assert.equal((checkpoint.metadata.sendProgress as Progress).done, false);
  assert.equal((h.campaign.metadata.sendProgress as Progress).done, true);
  assert.ok(h.events.indexOf("archive") < h.events.indexOf("send"));
  assert.ok(h.events.indexOf("guard") < h.events.indexOf("send"));
});
test("an exact-size final page finishes on its next empty read without three blocked retries", async () => {
  const h = engineHarness({ resumeAtEnd: true });
  const result = await h.engine.executeCampaignSend("campaign", { mode: "RESUME" });
  assert.equal(result.ok, true); assert.equal(result.status, "SENT"); assert.equal(h.state().calls, 0);
  assert.equal((h.campaign.metadata.sendProgress as Progress).blockedRuns, 0);
});
test("failed deferred count cannot mark the campaign completed", async () => {
  const h = engineHarness({ failQueueCount: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.ok, false); assert.equal(h.campaign.status, "SENDING"); assert.equal((h.campaign.metadata.sendProgress as Progress).done, false);
});
test("quiet recipients stay durable and counted once, then drain without inflating membership", async () => {
  const h = engineHarness({ quiet: true });
  const first = await h.engine.executeCampaignSend("campaign");
  assert.equal(first.status, "SENDING"); assert.equal(h.state().calls, 0); assert.equal(h.state().queue.length, 2);
  assert.equal((h.campaign.metadata.sendProgress as Progress).total, 2);
  h.releaseQuiet();
  const final = await h.engine.executeCampaignSend("campaign", { mode: "RESUME" });
  assert.equal(final.status, "SENT"); assert.equal(h.state().calls, 2); assert.equal(h.state().queue.length, 0);
  assert.equal((h.campaign.metadata.sendProgress as Progress).total, 2);
});
test("failed deferred removal is explicit and a later resume never resends accepted recipients", async () => {
  const h = engineHarness({ quiet: true }); await h.engine.executeCampaignSend("campaign");
  h.releaseQuiet(); h.options.failQueueDelete = true;
  assert.equal((await h.engine.executeCampaignSend("campaign", { mode: "RESUME" })).ok, false);
  assert.equal(h.state().calls, 2); assert.equal(h.state().queue.length, 2);
  h.options.failQueueDelete = false; h.expireLease();
  assert.equal((await h.engine.executeCampaignSend("campaign", { mode: "RESUME" })).status, "SENT");
  assert.equal(h.state().calls, 2); assert.equal(h.state().queue.length, 0);
});
test("an all-skipped final page is archived and counted instead of discarded", async () => {
  const h = engineHarness({ allSkipped: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.skipped, 2); assert.equal(result.total, 2); assert.equal(h.deliveries.length, 2); assert.equal(h.state().calls, 0);
});
for (const option of ["failSkip", "failCreate", "failContext"] as const) {
  test(`${option} stops progress rather than silently discarding recipients`, async () => {
    const h = engineHarness({ [option]: true, allSkipped: option === "failSkip" });
    assert.equal((await h.engine.executeCampaignSend("campaign")).ok, false);
    assert.equal((h.campaign.metadata.sendProgress as Progress).cursor, null); assert.equal(h.state().calls, 0);
  });
}
test("archive failure after provider acceptance is not reported as successful completion", async () => {
  const h = engineHarness({ failSentArchive: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.ok, false); assert.equal(h.campaign.status, "SENDING"); assert.equal((h.campaign.metadata.sendProgress as Progress).done, false);
  assert.ok(h.state().calls > 0);
});
test("pause is checked before creating rendered attempts and does not strand unsent records", async () => {
  const h = engineHarness({ pauseAtWorker: true }); assert.equal((await h.engine.executeCampaignSend("campaign")).ok, false);
  assert.equal(h.state().creates, 0); assert.equal(h.state().calls, 0);
});
test("a deadline before work leaves an unfinished, resumable campaign without sends", async () => {
  const h = engineHarness(); const result = await h.engine.executeCampaignSend("campaign", { timeBudgetMs: 1 });
  assert.equal(result.status, "SENDING"); assert.equal(result.hasMore, true); assert.equal(h.state().creates, 0);
});
test("current withdrawal skips recipients before provider contact", async () => {
  const h = engineHarness({ guardBlocks: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.skipped, 2); assert.equal(h.state().calls, 0);
});
test("a thrown provider request is archived as uncertain, not a successful send", async () => {
  const h = engineHarness({ sendThrows: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.sent, 0); assert.equal(result.failed, 2);
  assert.ok(h.deliveries.every((d) => d.errorMessage === "DELIVERY_OUTCOME_UNCERTAIN"));
});
test("same-contact donor records are claimed before awaiting and only one is sent", async () => {
  const h = engineHarness({ duplicateContact: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.sent, 1); assert.equal(result.skipped, 1); assert.equal(h.state().calls, 1);
});
test("simultaneous starts acquire status and lease atomically", async () => {
  const h = engineHarness(); await Promise.all([h.engine.executeCampaignSend("campaign"), h.engine.executeCampaignSend("campaign")]);
  assert.equal(h.state().calls, 2);
});
test("concurrent cancellation cannot be overwritten by finalization", async () => {
  const h = engineHarness({ cancelAtFinal: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.ok, false); assert.equal(h.campaign.status, "CANCELLED");
});
test("a failed final CAS leaves done false and recovers after lease expiry without duplicate sends", async () => {
  const h = engineHarness({ failFinal: true }); assert.equal((await h.engine.executeCampaignSend("campaign")).ok, false);
  assert.equal((h.campaign.metadata.sendProgress as Progress).done, false);
  h.options.failFinal = false; h.expireLease();
  assert.equal((await h.engine.executeCampaignSend("campaign", { mode: "RESUME" })).status, "SENT"); assert.equal(h.state().calls, 2);
});
test("counter synchronization failure is visible to the caller", async () => {
  const h = engineHarness({ failCounter: true }); const result = await h.engine.executeCampaignSend("campaign");
  assert.equal(result.ok, false); assert.equal(result.blocked, "COUNTERS_UPDATE_FAILED");
});
test("worker pool drains started requests and stops allocating work after a failure", async () => {
  const h = engineHarness(); const started: number[] = [], ended: number[] = [];
  await assert.rejects(h.engine.__test.mapWithConcurrency([0, 1, 2, 3], 2, async (id) => {
    started.push(id); if (id === 0) { await Promise.resolve(); throw new Error("stop"); }
    await new Promise((resolve) => setTimeout(resolve, 15)); ended.push(id); return id;
  }), /stop/);
  assert.deepEqual(started, [0, 1]); assert.deepEqual(ended, [1]);
});

function counterHarness(state = "SENT", incomplete = false, race = false) {
  const updatedAt = new Date(); let update: Dict | null = null;
  const service = isolated<{ computeFinalStatus: (t: number,s: number,k: number,f: number) => string; recomputeCampaignCounters: (id: string) => Promise<{ ok: boolean; status?: string; reason?: string }> }>("lib/communication/campaign-counter-service.ts", {
    "@/lib/prisma": { prisma: {
      communicationCampaign: {
        findUnique: async () => ({ status: state, updatedAt, metadata: incomplete ? { sendProgress: { done: false } } : null, sentCount: 0, deliveredCount: 0, readCount: 0, clickedCount: 0, repliedCount: 0, failedCount: 0 }),
        updateMany: async (input: Dict) => { update = input; return { count: race ? 0 : 1 }; },
      }, communicationDelivery: { findMany: async () => [{ status: "SENT" }, { status: "RENDERED" }] },
    } },
  });
  return { service, getUpdate: () => update, updatedAt };
}
test("partial outcomes cannot produce a clean SENT status", () => {
  const h = counterHarness(); assert.equal(h.service.computeFinalStatus(10, 1, 0, 0), "SENT_WITH_ISSUES"); assert.equal(h.service.computeFinalStatus(10, 10, 0, 0), "SENT");
});
test("counter updates compare current status and version and preserve unfinished blocks", async () => {
  const h = counterHarness("BLOCKED", true); const result = await h.service.recomputeCampaignCounters("campaign");
  assert.equal(result.status, "BLOCKED"); const where = h.getUpdate()!.where as Dict;
  assert.equal(where.status, "BLOCKED"); assert.equal(where.updatedAt, h.updatedAt);
});
test("counter race returns failure instead of overwriting a concurrent operator action", async () => {
  const result = await counterHarness("SENT", false, true).service.recomputeCampaignCounters("campaign");
  assert.equal(result.ok, false); assert.equal(result.reason, "CAMPAIGN_STATE_CHANGED");
});
for (const code of ["DELIVERY_OUTCOME_UNCERTAIN", "SEND_THREW  socket", "NETWORK_ERROR", "HTTP_503"]) {
  test(`retry refuses unresolved original evidence: ${code}`, async () => {
    const guard = isolated<{ checkRetryRecipient: (input: Dict) => Promise<{ ok: boolean; code?: string }> }>("lib/communication/retry-recipient-guard.ts", {
      "@/lib/prisma": { prisma: { communicationDelivery: { findUnique: async () => ({ errorMessage: code }) }, user: { findUnique: async () => { throw new Error("must not read donor after uncertain evidence"); } } } },
      "./campaign-audience-accounting": { recipientExclusionReason }, "./campaign-contact-validation": { normalizeCampaignContact },
    });
    const result = await guard.checkRetryRecipient({ id: "delivery", channel: "EMAIL", purpose: "MARKETING", campaignId: "campaign", recipientUserId: "user", recipientEmail: "u@example.test", recipientPhone: null });
    assert.equal(result.code, "DELIVERY_OUTCOME_UNCERTAIN");
  });
}
