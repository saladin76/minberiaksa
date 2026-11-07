import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as contracts from "../../lib/marketing/google-search/conversation-contracts";
import { searchPlanRequest } from "../../lib/marketing/google-search/contracts";
// Dynamic database-shaped records are isolated to this dependency-injected fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const id = "507f1f77bcf86cd799439011", requestId = "6410cce3-b09b-44ba-96c7-473602b4f03a";
const request = { connectionId: id, prompt: "Winter donation campaign", locales: ["ar"], countries: ["TR"], projectIds: [id], dailyBudget: 10, containsEuPoliticalAdvertising: false };
function fixture(options: { status?: string; fail?: boolean; recommendation?: string; conflict?: boolean } = {}) {
  let plan: Row = { id, version: 1, status: options.status || "DRAFT", request, proposal: { summary: "Reviewed", campaigns: [], expansion: [] }, evidence: { report: { currency: "USD" }, destinations: [], targeting: {} }, automationEnabled: false, resources: null, workLeaseUntil: null, workLeaseToken: null };
  let generated = 0;
  const db = { googleSearchPlan: {
    findUnique: async () => structuredClone(plan), findUniqueOrThrow: async () => structuredClone(plan),
    updateMany: async ({ where, data }: Row) => {
      if (where.version !== undefined && where.version !== plan.version || where.status && where.status !== plan.status || where.workLeaseToken && where.workLeaseToken !== plan.workLeaseToken || where.OR && plan.workLeaseUntil && plan.workLeaseUntil > new Date()) return { count: 0 };
      if (options.conflict && data.evidence?.conversation) { plan.version++; return { count: 0 }; }
      plan = { ...plan, ...data, version: data.version ? plan.version + 1 : plan.version }; return { count: 1 };
    },
  } };
  const deps: Row = {
    "node:crypto": { randomUUID: () => String(Math.random()) }, "@/lib/prisma": { prisma: db },
    "@/lib/ai/core/ai-core-service": { getAiContext: () => ({}) }, "./contracts": { searchPlanRequest }, "./conversation-contracts": contracts,
    "@/lib/ai/core/openai-provider": { generateOpenAiDraft: async (input: Row) => {
      generated++; assert.equal(JSON.parse(input.prompt).ownerMessage, "Improve the winter copy");
      if (options.fail) throw new Error("PROVIDER_TEMPORARY_FAILURE");
      return { status: "COMPLETED", mode: "OPENAI", answer: JSON.stringify({ reply: "Here is a proposal, no changes were executed.", recommendation: options.recommendation || "replan", suggestedDailyBudget: 20 }) };
    } },
  };
  const loaded = { exports: {} as Row };
  new vm.Script(ts.transpileModule(readFileSync("lib/marketing/google-search/conversation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, Date, JSON, require: (key: string) => { assert.ok(key in deps, key); return deps[key]; } });
  const body = { action: "chat", id, version: 1, requestId, message: "Improve the winter copy" };
  return { chat: (extra: Row = {}) => loaded.exports.converseSearchPlan({ ...body, ...extra }), revise: (version: number, text: string) => loaded.exports.reviseSearchPlan(id, version, text), plan: () => plan, count: () => generated, update: (data: Row) => { plan = { ...plan, ...data }; } };
}
test("chat persists owner/assistant context, removes unauthorized budget suggestions and deduplicates a response lost in transit", async () => {
  const h = fixture(); const first = await h.chat(); assert.equal(first.version, 2);
  assert.equal(first.evidence.conversation[0].user, "Improve the winter copy");
  assert.equal(first.evidence.conversation[0].assistant.recommendation, "replan");
  assert.equal(first.evidence.conversation[0].assistant.suggestedDailyBudget, null);
  assert.equal(first.evidence.conversation[0].planVersion, 2);
  assert.equal((await h.chat()).version, 2); assert.equal(h.count(), 1);
  await assert.rejects(h.chat({ requestId: "5cda7154-5375-4331-81ef-1d3323d88ba9" }), /PLAN_CHANGED_RELOAD/);
});
test("only one concurrent chat may claim a plan; AI failure or an intervening edit never overwrites evidence", async () => {
  const concurrent = fixture(); const results = await Promise.allSettled([concurrent.chat(), concurrent.chat()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(concurrent.count(), 1);
  const failed = fixture({ fail: true }); await assert.rejects(failed.chat(), /PROVIDER_TEMPORARY_FAILURE/); assert.equal(failed.plan().workLeaseToken, null); assert.equal(failed.plan().evidence.conversation, undefined);
  const stale = fixture({ conflict: true }); await assert.rejects(stale.chat(), /PLAN_CHANGED_RELOAD/); assert.equal(stale.plan().evidence.conversation, undefined);
});
test("deployed or uncertain plans cannot be replanned or acquire unsupported chat actions", async () => {
  const active = fixture({ status: "ACTIVE", recommendation: "replan" });
  assert.equal((await active.chat()).evidence.conversation[0].assistant.recommendation, "none");
  await assert.rejects(active.revise(2, "New copy"), /DEPLOYED_PLAN_CANNOT_BE_REWRITTEN/);
  const frozen = fixture({ status: "RECONCILE_REQUIRED" }); await assert.rejects(frozen.chat(), /PROVIDER_OPERATION_IN_PROGRESS/); assert.equal(frozen.count(), 0);
});
test("copy refinement preserves scope/budget, retains prior proposal, resets Google validation and resumes per-language planning", async () => {
  const h = fixture({ status: "VALIDATED" }); const next = await h.revise(1, "Use clearer winter copy");
  assert.equal(next.status, "PLANNING"); assert.equal(next.version, 2);
  assert.deepEqual(next.request.projectIds, request.projectIds); assert.deepEqual(next.request.locales, ["ar"]);
  assert.equal(next.request.dailyBudget, 10); assert.deepEqual(next.request.countries, ["TR"]);
  assert.equal(next.evidence.revisions[0].proposal.summary, "Reviewed"); assert.equal(next.evidence.completedLocales.length, 0);
  assert.equal(next.proposal.campaigns.length, 0); assert.match(next.request.prompt, /Use clearer winter copy/);
  await assert.rejects(h.revise(1, "stale"), /PLAN_CHANGED_RELOAD/);
});
test("chat rejects vendor-operation keys, invalid versions and oversized messages before model access", async () => {
  const h = fixture(); await assert.rejects(h.chat({ operations: [{ remove: "anything" }] }));
  await assert.rejects(h.chat({ message: "x".repeat(4001) })); await assert.rejects(h.chat({ version: 0 })); assert.equal(h.count(), 0);
});
