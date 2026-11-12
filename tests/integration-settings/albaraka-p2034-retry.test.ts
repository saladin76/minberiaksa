import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Settlement = (id: string, sale: Record<string, unknown>) => Promise<boolean>;
function fixture(failures: number, failureCode = "P2034") {
  const donation = {
    id: "fixture-donation", paidAt: null as Date | null, status: "PENDING",
    providerRaw: {}, totalAmount: 10, items: [{ campaignId: "fixture-project", amount: 10, amountUSD: 10 }],
    categoryItems: [] as Array<{ categoryId: string; amount: number }>, subscriptionId: null,
    providerOrderId: "fixture-bank-order",
  };
  let campaignTotal = 0;
  let calls = 0;
  let paidEvents = 0;
  const prisma = {
    $transaction: async (callback: (tx: Record<string, unknown>) => Promise<boolean>) => {
      calls++;
      let pendingPaid: Date | null = donation.paidAt;
      let pendingCampaign = campaignTotal;
      const tx = {
        donation: {
          findUnique: async () => ({ ...donation, paidAt: pendingPaid }),
          update: async (args: { data: { paidAt: Date } }) => { pendingPaid = args.data.paidAt; return {}; },
        },
        campaign: {
          update: async (args: { data: { currentAmount: { increment: number } } }) => {
            pendingCampaign += args.data.currentAmount.increment;
            if (calls <= failures) throw Object.assign(new Error("write conflict"), { code: failureCode });
          },
        },
        category: { update: async () => ({}) },
        subscription: { findUnique: async () => null, update: async () => ({}) },
      };
      const result = await callback(tx);
      // Only committed Mongo transactions are allowed to change state.
      donation.paidAt = pendingPaid;
      campaignTotal = pendingCampaign;
      return result;
    },
  };
  const imports: Record<string, unknown> = {
    "./mixed-cart": {
      mixedCheckoutParent: () => false, mixedCheckoutPayment: () => null,
      validMixedCheckoutGroup: () => true, mixedCheckoutIds: () => [],
    },
    "server-only": {},
    "@/lib/events/after-response": { runAfterResponse: (callback: () => void) => callback() },
    "@/lib/prisma": { prisma },
    "@/lib/albaraka": { albarakaIsoCode: (code: string) => code },
    "@/lib/tracking/donation-conversion-server": { sendDonationFailedConversions: () => {} },
    "@/lib/events/dispatch": {
      dispatchDonationPaid: () => { paidEvents++; },
      dispatchEvent: () => {},
    },
    "@/lib/donations/recurring-schedule": {
      firstChargeForPlan: () => new Date(), nextChargeAfterPayment: () => new Date(),
    },
    "./mongo-null": { donationFieldEmpty: () => ({}), donationWhereAll: () => ({}) },
  };
  const source = ts.transpileModule(fs.readFileSync("lib/donations/albaraka-settlement.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} as { settleAlbarakaDonation: Settlement } };
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports,
    require: (name: string) => {
      assert.ok(name in imports, "unexpected import " + name);
      return imports[name];
    },
    setTimeout, Date, console,
  });
  return {
    settle: () => loaded.exports.settleAlbarakaDonation(donation.id, {
      ServiceResponseData: { ResponseCode: "00" }, AuthCode: "AUTH", ReferenceCode: "BANK-REF",
    }),
    stats: () => ({ calls, campaignTotal, paidEvents, paidAt: donation.paidAt }),
  };
}

test("P2034 retries only local settlement and releases paid events once after commit", async () => {
  const f = fixture(2);
  assert.equal(await f.settle(), true);
  assert.equal(f.stats().calls, 3);
  assert.equal(f.stats().campaignTotal, 10);
  assert.equal(f.stats().paidEvents, 1);
  assert.ok(f.stats().paidAt instanceof Date);
  assert.equal(await f.settle(), true, "second callback must be idempotent");
  assert.equal(f.stats().campaignTotal, 10);
  assert.equal(f.stats().paidEvents, 1);
});

test("exhausted P2034 never credits ledger or dispatches success", async () => {
  const f = fixture(5);
  await assert.rejects(f.settle(), (error: unknown) => (error as { code?: string })?.code === "P2034");
  assert.equal(f.stats().calls, 3);
  assert.equal(f.stats().campaignTotal, 0);
  assert.equal(f.stats().paidEvents, 0);
  assert.equal(f.stats().paidAt, null);
});

test("non-conflict errors are never automatically retried", async () => {
  const f = fixture(1, "P2002");
  await assert.rejects(f.settle(), (error: unknown) => (error as { code?: string })?.code === "P2002");
  assert.equal(f.stats().calls, 1);
  assert.equal(f.stats().campaignTotal, 0);
  assert.equal(f.stats().paidEvents, 0);
});
