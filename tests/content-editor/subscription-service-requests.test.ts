import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { subscriptionRequestCopy, subscriptionRequestKinds } from "../../lib/donations/subscription-request-copy";
import { requestMatchesPlan } from "../../lib/donations/subscription-request-policy";
import { retiredTemplateDisposition } from "../../lib/communication/retired-template-policy";
import { recurringAudienceWhere, cleanAudienceFrequencies } from "../../lib/communication/recurring-audience";
import { SUPPORTED_LOCALES, isValidLocale } from "../../lib/locales";

function fixture(signedIn = true, owned = true) {
  const id = "a".repeat(24), donorId = "b".repeat(24), requestId = "c".repeat(24);
  let row: Record<string, unknown> | null = null, writes = 0, billingWrites = 0, queued = 0;
  const plan = { id, donorId, status: "ACTIVE", amount: 10, currency: "EUR" };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } },
    "next-auth": { getServerSession: async () => signedIn ? { user: { id: donorId } } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => signedIn ? null : Response.json({}, { status: 403 }) },
    "@/lib/locales": { isValidLocale }, "@/lib/donations/subscription-request-copy": { subscriptionRequestKinds },
    "@/lib/donations/subscription-requests": { notifySubscriptionRequest: async () => { throw new Error("No actual message send is permitted in this test"); } },
    "@/lib/donations/subscription-request-policy": { requestMatchesPlan },
    "@/lib/events/after-response": { runAfterResponse: () => { queued++; } },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({ actorRole: "ADMIN" }) },
    "@/lib/prisma": { prisma: {
      subscription: { findFirst: async (args: { where: { id: string; donorId: string } }) => { assert.equal(args.where.donorId, donorId); return owned ? plan : null; }, findUnique: async () => plan, update: async () => { billingWrites++; throw new Error("Billing must not change"); } },
      subscriptionServiceRequest: {
        findUnique: async () => row,
        create: async ({ data }: { data: Record<string, unknown> }) => { writes++; row = { ...data, id: requestId, status: "NEW", createdAt: new Date(), updatedAt: new Date(), completedAt: null }; return row; },
        updateMany: async ({ data }: { data: Record<string, unknown> }) => { writes++; row = { ...row, ...data }; return { count: 1 }; },
      },
    } },
  };
  const load = (path: string) => {
    const mod = { exports: {} as { POST: (request: Request, context: unknown) => Promise<Response>; PATCH: (request: Request) => Promise<Response> } };
    const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    new vm.Script(js).runInNewContext({ module: mod, exports: mod.exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    return mod.exports;
  };
  const donor = load("app/api/users/me/subscriptions/[id]/requests/route.ts"), admin = load("app/api/admin/subscription-requests/route.ts");
  const req = (body: unknown) => new Request("https://fixture.test/api/request", { method: "POST", body: JSON.stringify(body) });
  return { plan, post: (body: unknown) => donor.POST(req(body), { params: Promise.resolve({ id }) }), patch: (status: string) => admin.PATCH(req({ id: requestId, status, staffNote: "Reviewed request" })), stats: () => ({ writes, billingWrites, queued }), row: () => row };
}
test("request creation authenticates and verifies ownership before writing or queuing a notification", async () => {
  for (const f of [fixture(false), fixture(true, false)]) {
    assert.equal((await f.post({ kind: "CANCEL", note: "", locale: "tr" })).status, 404);
    assert.deepEqual(f.stats(), { writes: 0, billingWrites: 0, queued: 0 });
  }
});
test("duplicate donor requests reuse the existing ticket and cannot change billing, currency or donor identity", async () => {
  const f = fixture(), body = { kind: "AMOUNT_CHANGE", amount: 5, note: "Please change the amount", locale: "tr", donorId: "attacker", currency: "USD" };
  assert.equal((await f.post(body)).status, 201);
  assert.equal((await (await f.post(body)).json()).alreadyReceived, true);
  assert.deepEqual(f.stats(), { writes: 1, billingWrites: 0, queued: 1 });
  assert.equal(f.row()!.currency, "EUR"); assert.equal(f.row()!.donorId, "b".repeat(24));
  assert.equal(f.plan.amount, 10); assert.equal(f.plan.status, "ACTIVE");
});
test("invalid request data and cancelled plans never create a ticket", async () => {
  const f = fixture();
  for (const body of [null, { kind: "CANCEL", note: "", locale: "unknown" }, { kind: "AMOUNT_CHANGE", amount: 0, note: "", locale: "en" }, { kind: "AMOUNT_CHANGE", amount: 10, note: "", locale: "en" }, { kind: "CANCEL", note: "x".repeat(2001), locale: "en" }]) assert.equal((await f.post(body)).status, 400);
  f.plan.status = "CANCELLED";
  assert.equal((await f.post({ kind: "CANCEL", note: "", locale: "en" })).status, 409);
  assert.equal(f.stats().writes, 0);
});
test("staff cannot complete an unfulfilled request or perform a billing mutation through request status", async () => {
  const f = fixture(); await f.post({ kind: "PAUSE", note: "Please pause", locale: "en" });
  assert.equal((await f.patch("COMPLETED")).status, 409);
  assert.equal((await f.patch("IN_PROGRESS")).status, 200);
  assert.equal(f.plan.status, "ACTIVE");
  f.plan.status = "PAUSED";
  assert.equal((await f.patch("COMPLETED")).status, 200);
  assert.equal(f.row()!.status, "COMPLETED");
  assert.equal(f.stats().billingWrites, 0); assert.equal(f.stats().queued, 2);
});
test("request copies cover all 19 languages and never mix Arabic into other scripts except Urdu", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = subscriptionRequestCopy(locale); assert.equal(copy.length, 13); assert.ok(copy.every(Boolean));
    if (!["ar", "ur"].includes(locale)) assert.doesNotMatch(copy.join(" "), /[\u0600-\u06ff]/);
  }
});
test("retired template cleanup preserves all bindings and archives history instead of deleting it", () => {
  assert.equal(retiredTemplateDisposition({ retired: false, triggers: 0, campaigns: 0, history: 0 }), "KEEP");
  assert.equal(retiredTemplateDisposition({ retired: true, triggers: 1, campaigns: 0, history: 0 }), "KEEP");
  assert.equal(retiredTemplateDisposition({ retired: true, triggers: 0, campaigns: 1, history: 0 }), "KEEP");
  assert.equal(retiredTemplateDisposition({ retired: true, triggers: 0, campaigns: 0, history: 1 }), "ARCHIVE");
  assert.equal(retiredTemplateDisposition({ retired: true, triggers: 0, campaigns: 0, history: 0 }), "DELETE");
});
test("audience cadence inclusion and exclusion compose with monthly legacy handling and paid evidence", () => {
  assert.deepEqual(cleanAudienceFrequencies(["DAILY", "UNKNOWN", "DAILY", "FRIDAY"]), ["DAILY", "FRIDAY"]);
  const where = recurringAudienceWhere({ recurringFrequencies: ["MONTHLY"], excludeRecurringFrequencies: ["DAILY"] });
  assert.equal(where.length, 2);
  const text = JSON.stringify(where);
  assert.match(text, /NOT/); assert.match(text, /PAID/); assert.match(text, /paidAt/); assert.match(text, /none/);
  const once = JSON.stringify(recurringAudienceWhere({ oneTimeOnly: true }));
  assert.match(once, /isSet/); assert.match(once, /subscriptionId/); assert.match(once, /none/);
});
