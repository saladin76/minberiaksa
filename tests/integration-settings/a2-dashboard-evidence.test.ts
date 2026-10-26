import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as calendar from "../../lib/admin/istanbul-calendar";
import { addHomeSummaryDonation, emptyHomeDonationSummary, type SummaryDonation } from "../../lib/dashboard/home-donation-summary";
import { donationPaymentEvidence } from "../../lib/donations/payment-evidence";
import { dialogPaymentIssue } from "../../lib/minbar/dialog-payment-validation";

const range = { monthStart: new Date("2026-09-30T21:00:00Z"), todayStart: new Date("2026-10-25T21:00:00Z"), now: new Date("2026-10-26T12:00:00Z") };
const row: SummaryDonation = { status: "PAID", paidAt: new Date("2026-10-26T11:00:00Z"), createdAt: new Date("2026-09-29T00:00:00Z"), amountUSD: 120, totalAmount: 120, teamSupport: 20, currency: "USD" };

test("home revenue follows confirmed payment time and apportions stored total support once", () => {
  const summary = emptyHomeDonationSummary();
  addHomeSummaryDonation(summary, row, range);
  assert.deepEqual(summary.today, { amountUSD: 120, count: 1, unpriced: 0 });
  assert.deepEqual(summary.month, { amountUSD: 120, count: 1, unpriced: 0 });
  assert.deepEqual(summary.support, { amountUSD: 20, count: 1, unpriced: 0 });
  assert.equal(summary.failed.count, 0);
});

test("unconfirmed, future and failed-with-payment timestamps cannot inflate home revenue or failed attempts", () => {
  const summary = emptyHomeDonationSummary();
  for (const change of [{ paidAt: null }, { paidAt: new Date("2026-10-27T00:00:00Z") }, { status: "FAILED" }]) addHomeSummaryDonation(summary, { ...row, ...change }, range);
  assert.equal(summary.month.count, 0);
  assert.equal(summary.failed.count, 0);
  addHomeSummaryDonation(summary, { ...row, status: "FAILED", paidAt: null, createdAt: range.todayStart }, range);
  assert.deepEqual(summary.failed, { amountUSD: 120, count: 1, unpriced: 0 });
});

test("USD fallback uses gross total and missing foreign conversion is flagged rather than guessed", () => {
  const summary = emptyHomeDonationSummary();
  addHomeSummaryDonation(summary, { ...row, amountUSD: null }, range);
  addHomeSummaryDonation(summary, { ...row, amountUSD: null, currency: "EUR" }, range);
  assert.equal(summary.month.amountUSD, 120);
  assert.equal(summary.month.count, 2);
  assert.equal(summary.month.unpriced, 1);
  assert.equal(summary.support.unpriced, 1);
});

test("payment mode is evidence based, with PayFor always 3D and legacy Albaraka left unknown", () => {
  assert.equal(donationPaymentEvidence({ provider: "PAYFOR" }).securityMode, "3D");
  assert.equal(donationPaymentEvidence({ provider: "ALBARAKA", providerRaw: { albarakaRequest: { mode: "3D" } } }).securityMode, "3D");
  assert.equal(donationPaymentEvidence({ provider: "ALBARAKA", providerTxnType: "RecurringSale" }).securityMode, "2D");
  assert.equal(donationPaymentEvidence({ provider: "ALBARAKA" }).securityMode, null);
  assert.equal(donationPaymentEvidence({ provider: "PAYPAL" }).securityMode, null);
});

test("historical recurring bank code is recovered for display without exposing raw fields", () => {
  const result = donationPaymentEvidence({ provider: "ALBARAKA", providerTxnType: "RecurringSale", providerRaw: { albarakaSale: { ServiceResponseData: { ResponseCode: "05", ResponseDescription: "private" } } } });
  assert.equal(result.bankResponseCode, "05");
  assert.equal(result.isRecurringCharge, true);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

const valid = { guest: true, firstName: "Fixture", lastName: "Donor", email: "fixture@example.test", phoneValid: true, cardRequired: true, savedCard: false, card: { cardNumber: "4111111111111111", expiryDate: "12/39", cvv: "123", cardholderName: "Fixture" } };
test("popup identifies missing donor fields before payment processing", () => {
  assert.equal(dialogPaymentIssue({ ...valid, firstName: "" })?.field, "firstName");
  assert.equal(dialogPaymentIssue({ ...valid, lastName: "" })?.field, "lastName");
  assert.equal(dialogPaymentIssue({ ...valid, email: "bad@" })?.field, "email");
  assert.equal(dialogPaymentIssue({ ...valid, phoneValid: false })?.field, "phone");
});
test("popup distinguishes invalid cards from saved-card CVC and preserves wallet path", () => {
  assert.equal(dialogPaymentIssue(valid), null);
  assert.equal(dialogPaymentIssue({ ...valid, card: { ...valid.card, cardNumber: "4111111111111112" } })?.field, "cardNumber");
  assert.equal(dialogPaymentIssue({ ...valid, card: { ...valid.card, cardholderName: "" } })?.field, "cardholderName");
  assert.equal(dialogPaymentIssue({ ...valid, savedCard: true, card: { ...valid.card, cvv: "" } })?.field, "cvv");
  assert.equal(dialogPaymentIssue({ ...valid, cardRequired: false, card: { cardNumber: "", expiryDate: "", cvv: "", cardholderName: "" } }), null);
});


test("home summary route preserves numeric metrics, separates date labels and paginates read-only after authorization", async () => {
  let allowed = false;
  const queries: Array<{ take: number; where: { AND: Array<unknown> } }> = [];
  let batch = 0;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options?: { status?: number }) => ({ body, status: options?.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { role: "ADMIN" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/api-auth": { requireAdminOrDashboardPermission: (_session: unknown, permission: string) => { assert.equal(permission, "revenue"); return allowed ? null : { status: 403 }; } },
    "@/lib/admin/istanbul-calendar": calendar,
    "@/lib/dashboard/home-donation-summary": { addHomeSummaryDonation, emptyHomeDonationSummary },
    "@/lib/prisma": { prisma: { donation: new Proxy({}, { get(_target, key) {
      assert.equal(key, "findMany", "Summary cannot write donations");
      return async (query: typeof queries[number]) => {
        queries.push(query);
        const now = new Date(Date.now() - 1000);
        return batch++ === 0 ? Array.from({ length: 500 }, (_, index) => ({ ...row, id: String(index).padStart(5, "0"), paidAt: now })) : [];
      };
    } }) } },
  };
  type Reply = { status: number; body: { today: { count: number }; month: { count: number; amountUSD: number }; todayKey: string; monthKey: string; averageUSD: number } };
  const loaded = { exports: {} as { GET(): Promise<Reply> } };
  const code = ts.transpileModule(readFileSync("app/api/admin/dashboard-summary/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code).runInNewContext({ exports: loaded.exports, module: loaded, Date, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  assert.equal((await loaded.exports.GET()).status, 403);
  assert.equal(queries.length, 0);
  allowed = true;
  const reply = await loaded.exports.GET();
  assert.equal(reply.status, 200);
  assert.equal(reply.body.month.count, 500);
  assert.equal(reply.body.month.amountUSD, 60000);
  assert.equal(reply.body.today.count, 500);
  assert.equal(reply.body.averageUSD, 120);
  assert.match(reply.body.todayKey, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(reply.body.monthKey, /^\d{4}-\d{2}$/);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].take, 500);
  assert.equal(JSON.stringify(queries[1].where.AND[1]), JSON.stringify({ id: { gt: "00499" } }));
});
