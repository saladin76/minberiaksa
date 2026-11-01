import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "../../lib/donations/subscription-request-policy";
import * as copy from "../../lib/donations/subscription-request-copy";
import { SUPPORTED_LOCALES, isValidLocale } from "../../lib/locales";

function fixture() {
  const donorId = "b".repeat(24), planId = "a".repeat(24), id = "c".repeat(24);
  let rows: Record<string, unknown>[] = [], role = "DONOR", clock = 1, auditFails = false, queued = 0, reads = 0;
  const plan = { id: planId, donorId, status: "ACTIVE", amount: 20, currency: "EUR", nextBillingDate: new Date("2030-12-01") };
  const audits: unknown[] = [];
  function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => value instanceof Date ? (row[key] as Date)?.getTime() === value.getTime() :
      typeof value === "object" && value && "in" in value ? (value.in as unknown[]).includes(row[key]) : row[key] === value);
  }
  const database = {
    subscription: { findFirst: async ({ where }: { where: Record<string, unknown> }) => { reads++; return where.id === planId && where.donorId === donorId ? plan : null; }, findUnique: async () => plan, findMany: async () => [plan] },
    subscriptionServiceRequest: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where))!,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
      findMany: async ({ where, skip = 0, take = 50 }: { where: Record<string, unknown>; skip?: number; take?: number }) => { reads++; return rows.filter(row => matches(row, where)).slice(skip, skip + take); },
      count: async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: rows.length ? "d".repeat(24) : id, status: "NEW", createdAt: new Date(clock++), updatedAt: new Date(clock++), completedAt: null, staffNote: null }; rows.push(row); return row; },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { const index = rows.findIndex(row => matches(row, where)); if (index < 0) return { count: 0 }; rows[index] = { ...rows[index], ...data, updatedAt: new Date(clock++) }; return { count: 1 }; },
    },
    user: { findMany: async () => [{ id: donorId, name: "Fixture Donor" }] },
    auditLog: { create: async (input: unknown) => { if (auditFails) throw new Error("audit unavailable"); audits.push(input); } },
    $transaction: async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => { const snapshot = structuredClone(rows); try { return await run(database); } catch (error) { rows = snapshot; throw error; } },
  };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => role === "NONE" ? null : { user: { id: donorId, role } } },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: () => role === "ADMIN" ? null : Response.json({}, { status: 403 }) },
    "@/lib/prisma": { prisma: database }, "@/lib/locales": { isValidLocale }, "@/lib/donations/subscription-request-copy": copy,
    "@/lib/donations/subscription-request-policy": policy, "@/lib/events/after-response": { runAfterResponse: () => { queued++; } },
    "@/lib/donations/subscription-requests": { notifySubscriptionRequest: () => { throw new Error("No real delivery is permitted"); } },
    "@/lib/audit-log": { auditActorFromDashboardSession: () => ({ actorId: donorId, actorRole: role, actorName: "Fixture" }) },
  };
  function load(file: string) {
    const mod = { exports: {} as Record<string, (...args: unknown[]) => Promise<Response>> };
    new vm.Script(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)
      .runInNewContext({ module: mod, exports: mod.exports, Date, console: { error() {} }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    return mod.exports;
  }
  const donor = load("app/api/users/me/subscriptions/[id]/requests/route.ts"), admin = load("app/api/admin/subscription-requests/route.ts");
  const request = (body: unknown) => new Request("https://fixture.invalid/request", { method: "POST", body: JSON.stringify(body) });
  const context = { params: Promise.resolve({ id: planId }) };
  return { plan, audits, role: (value: string) => { role = value; }, failAudit: () => { auditFails = true; }, row: () => rows[0], stats: () => ({ queued, reads }),
    post: (body: Record<string, unknown> = {}) => donor.POST(request({ kind: "AMOUNT_CHANGE", amount: 10, note: "Please reduce", locale: "en", ...body }), context),
    withdraw: (body: Record<string, unknown> = {}) => donor.PATCH(request({ requestId: id, updatedAt: (rows[0]?.updatedAt as Date)?.toISOString(), ...body }), context),
    patch: (body: Record<string, unknown> = {}) => admin.PATCH(request({ id, status: "IN_PROGRESS", updatedAt: (rows[0]?.updatedAt as Date)?.toISOString(), staffNote: "Internal sensitive note", resolutionNote: "", ...body })),
    getDonor: () => donor.GET({}, context), getAdmin: (params = "") => admin.GET({ nextUrl: new URL("https://fixture.invalid/requests?" + params) }),
  };
}

test("an authenticated donor request progresses through review, verified execution, and a private-safe outcome", async () => {
  const f = fixture(); assert.equal((await f.post()).status, 201);
  const firstRevision = (f.row().updatedAt as Date).toISOString();
  f.role("ADMIN"); assert.equal((await f.patch({ updatedAt: undefined })).status, 409); assert.equal(f.row().status, "NEW"); assert.equal((await f.patch()).status, 200);
  assert.equal((await f.patch({ updatedAt: firstRevision, resolutionNote: "stale write" })).status, 409);
  assert.equal((await f.patch({ status: "COMPLETED" })).status, 409);
  f.plan.amount = 10;
  assert.equal((await f.patch({ status: "COMPLETED", resolutionNote: "The lower amount starts next cycle." })).status, 200);
  assert.equal((await f.patch({ status: "COMPLETED" })).status, 409);
  const response = await f.getDonor(), data = await response.json();
  assert.equal(data.requests[0].status, "COMPLETED"); assert.equal(data.requests[0].history.length, 3);
  assert.equal(data.requests[0].resolutionNote, "The lower amount starts next cycle.");
  assert.doesNotMatch(JSON.stringify(data), /Internal sensitive note|activeKey|handledById/);
  assert.equal(f.audits.length, 2); assert.equal(f.stats().queued, 2); assert.equal(f.plan.nextBillingDate.toISOString(), "2030-12-01T00:00:00.000Z");
});

test("a conflicting duplicate is explicit, a withdrawal releases the request key, and closed requests cannot be edited", async () => {
  const f = fixture(); await f.post();
  assert.equal((await f.post()).status, 200); assert.equal((await f.post({ amount: 5 })).status, 409);
  const stale = "2000-01-01T00:00:00.000Z";
  assert.equal((await f.withdraw({ updatedAt: stale })).status, 409);
  assert.equal((await f.withdraw()).status, 200); assert.equal(f.row().status, "WITHDRAWN");
  assert.equal((await f.withdraw()).status, 409); assert.equal((await f.post({ amount: 5 })).status, 201);
  assert.equal(f.plan.amount, 20); assert.equal(f.plan.status, "ACTIVE");
});

test("another request id, a non-owner, invalid reductions and missing admin permissions cannot mutate requests", async () => {
  const f = fixture();
  for (const amount of [0, 0.5, 20, 21, 1.151]) assert.equal((await f.post({ amount })).status, 400);
  await f.post(); assert.equal((await f.patch()).status, 403);
  assert.equal((await f.withdraw({ requestId: "e".repeat(24) })).status, 409);
  f.role("NONE"); assert.equal((await f.withdraw()).status, 404); assert.equal((await f.getDonor()).status, 404);
  f.role("ADMIN"); assert.equal((await f.patch({ status: "REJECTED" })).status, 400);
  assert.equal((await f.patch({ status: "REJECTED", resolutionNote: "Please confirm the billing date first." })).status, 200);
  assert.equal(f.row().status, "REJECTED"); assert.equal(f.plan.amount, 20);
});

test("audit failure rolls back the request and cannot send a false completion notification", async () => {
  const f = fixture(); await f.post(); f.role("ADMIN"); f.failAudit();
  assert.equal((await f.patch()).status, 503); assert.equal(f.row().status, "NEW"); assert.equal(f.stats().queued, 1);
});

test("completion cannot match another currency, donor, missing plan or a cancelled amount-change plan", () => {
  const request = { kind: "AMOUNT_CHANGE", requestedAmount: 10, currency: "EUR", donorId: "a" };
  for (const plan of [null, { status: "ACTIVE", amount: 10, currency: "USD", donorId: "a" }, { status: "ACTIVE", amount: 10, currency: "EUR", donorId: "b" }, { status: "CANCELLED", amount: 10, currency: "EUR", donorId: "a" }]) assert.equal(policy.requestMatchesPlan(request, plan), false);
});

test("all donor follow-up labels are present in all 19 locales and history omits extra private fields", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const texts = copy.subscriptionRequestFollowUp(locale); assert.equal(texts.length, 12); assert.ok(texts.every(Boolean));
    if (!["ar", "ur"].includes(locale)) assert.doesNotMatch(texts.join(" "), /[\u0600-\u06ff]/);
    for (const status of [...policy.OPEN_REQUEST_STATUSES, ...policy.CLOSED_REQUEST_STATUSES]) assert.ok(copy.subscriptionRequestStatusLabel(status, locale));
  }
  assert.deepEqual(policy.requestHistory([{ status: "COMPLETED", at: "2026-11-01", actorRole: "TEAM", reply: "Visible", staffNote: "private", actorId: "private" }, { status: "BAD", at: "invalid" }]), [{ status: "COMPLETED", at: "2026-11-01", actorRole: "TEAM", reply: "Visible" }]);
});
