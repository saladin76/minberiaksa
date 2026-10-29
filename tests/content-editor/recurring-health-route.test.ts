import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { recurringScheduleSnapshot } from "../../lib/donations/recurring-schedule-snapshot";
function fixture(allowed = true, stale = false) {
  let reads = 0;
  const lastBillingDate = new Date(Date.now() - 86400000), nextBillingDate = new Date(Date.now() + 86400000);
  const row = { id: "private-plan-id", provider: "ALBARAKA", status: "ACTIVE", lastBillingDate, nextBillingDate, paymentCardId: "private-card-reference", donations: [{ id: "private-payment-id" }] };
  const loaded = { exports: {} as { GET: () => Promise<Response> } };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => ({ user: {} }) }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { assert.equal(permission, "monthly"); return allowed ? null : Response.json({}, { status: 403 }); } },
    "@/lib/albaraka": { isAlbarakaRecurringEnabled: () => true, isAlbarakaRecurringCheckoutReady: () => true }, "@/lib/paypal": { isPayPalConfigured: () => true, isPayPalRecurringEnabled: () => true },
    "@/lib/dashboard/recurring-frequency-filter": { loadSubscriptionFrequencies: async () => () => "DAILY" }, "@/lib/donations/recurring-schedule-snapshot": { recurringScheduleSnapshot },
    "@/lib/prisma": { prisma: { subscription: { findMany: async () => { reads++; return [row]; } }, auditLog: { findFirst: async () => ({ action: "RECURRING_CHARGES_CHECK", createdAt: new Date(Date.now() - (stale ? 7200000 : 1000)), messageAr: "Read-only test", metadata: { ok: true, privateFixture: "do-not-return" } }) } } },
  };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/subscriptions/health/route.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { get: loaded.exports.GET, reads: () => reads };
}
test("recurring schedule verification requires monthly permission before reading any plans", async () => {
  const h = fixture(false); assert.equal((await h.get()).status, 403); assert.equal(h.reads(), 0);
});
test("health returns upcoming dates and read-only evidence without card references or raw audit metadata", async () => {
  const h = fixture(), response = await h.get(), body = await response.json();
  assert.equal(body.readOnly, true); assert.equal(body.complete, true); assert.equal(body.schedule.counts.scheduled, 1); assert.ok(body.schedule.nextScheduledAt);
  assert.equal(body.schedulerState, "recent"); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(JSON.stringify(body), /private-plan|private-card|private-payment|do-not-return/);
});
test("valid upcoming dates never conceal a stale scheduler heartbeat", async () => {
  const body = await (await fixture(true, true).get()).json(); assert.equal(body.schedule.counts.scheduled, 1); assert.equal(body.schedulerState, "stale");
});
