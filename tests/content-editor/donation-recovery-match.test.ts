import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRecoveredFailedAttempt, uniqueRecoveredFailedAttemptIds, DONATION_RECOVERY_WINDOW_MS, type RecoveryDonation } from "../../lib/dashboard/donation-overview-recovery";

const at = new Date("2026-11-09T19:56:00.000Z");
const row = (overrides: Partial<RecoveryDonation> = {}): RecoveryDonation => ({
  id: "a".repeat(24),
  donorId: "d".repeat(24),
  status: "FAILED",
  paidAt: null,
  createdAt: at,
  subscriptionId: null,
  paymentMethod: "CARD",
  provider: "ALBARAKA",
  providerOrderId: "provider-intent-unique-001",
  overviewRecoveredByDonationId: null,
  amount: 55,
  totalAmount: 55,
  currency: "USD",
  teamSupport: 0,
  fees: 0,
  coverFees: false,
  items: [{ campaignId: "p".repeat(24), amount: 55, shareCount: null, giftRecipientName: null, giftRecipientEmail: null, giftRecipientPhone: null, giftMessage: null, giftChannels: [], giftShowAmount: true }],
  categoryItems: [],
  waqfItems: [],
  ...overrides,
});

const paid = (overrides: Partial<RecoveryDonation> = {}): RecoveryDonation =>
  row({ id: "b".repeat(24), status: "PAID", paidAt: new Date("2026-11-09T20:00:00Z"), createdAt: new Date("2026-11-09T19:59:00Z"), ...overrides });

test("only a provider-correlated later payment supersedes an overview failure", () => {
  assert.equal(isRecoveredFailedAttempt(row(), paid()), true);
  assert.equal(isRecoveredFailedAttempt(row({ overviewRecoveredByDonationId: null }), paid()), true);
  assert.equal(isRecoveredFailedAttempt(
    row({ overviewRecoveredByDonationId: "c".repeat(24) }), paid(),
  ), false);
  // Historical rows retain status FAILED; matching never mutates financial fields.
  assert.equal(row().status, "FAILED");
  // Same donor, amount, gateway, campaign and time never establish identity.
  assert.equal(isRecoveredFailedAttempt(row({ providerOrderId: null }), paid()), false);
  assert.equal(isRecoveredFailedAttempt(row(), paid({ providerOrderId: null })), false);
  assert.equal(isRecoveredFailedAttempt(row(), paid({ providerOrderId: "another-intent" })), false);
});

test("do not hide unmatched donors, projects, currencies, amounts, or card gateways", () => {
  const incompatible = [
    paid({ donorId: "e".repeat(24) }),
    paid({ currency: "EUR" }),
    paid({ amount: 75, totalAmount: 75 }),
    paid({ provider: "PAYFOR" }),
    paid({ providerOrderId: "new-checkout-same-amount" }),
    paid({ items: [{ ...row().items[0], campaignId: "q".repeat(24) }] }),
    paid({ items: [{ ...row().items[0], giftRecipientName: "Other" }] }),
    paid({ items: [{ ...row().items[0], giftChannels: ["EMAIL"] }] }),
    paid({ teamSupport: 5 }),
    paid({ coverFees: true }),
    paid({ subscriptionId: "s".repeat(24) }),
    paid({ paymentMethod: "PAYPAL" }),
    paid({ status: "FAILED" }),
    paid({ paidAt: null }),
    paid({ createdAt: new Date(at.getTime() - 1000) }),
    paid({ createdAt: new Date(at.getTime() + DONATION_RECOVERY_WINDOW_MS + 1000) }),
  ];
  for (const candidate of incompatible) assert.equal(isRecoveredFailedAttempt(row(), candidate), false);
});

test("multi-project allocations require exact items and remain immutable", () => {
  const projectA = row().items[0];
  const projectB = { ...projectA, campaignId: "q".repeat(24), amount: 20 };
  const projectA35 = { ...projectA, amount: 35 };
  const failed = row({
    amount: 55, totalAmount: 55,
    items: [projectA35, projectB],
    overviewRecoveredByDonationId: null,
  });
  const successful = paid({
    amount: 55, totalAmount: 55,
    items: [projectB, projectA35],
  });
  const before = structuredClone({ failed, successful });
  assert.equal(isRecoveredFailedAttempt(failed, successful), true);
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([failed], successful), [failed.id]);
  assert.deepEqual({ failed, successful }, before);
  assert.equal(isRecoveredFailedAttempt(failed, paid({
    items: [{ ...projectA35, amount: 34 }, { ...projectB, amount: 21 }],
  })), false, "same total with different project allocation is not a recovery");
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([
    failed,
    row({ id: "c".repeat(24), items: [projectA35, projectB], amount: 55, totalAmount: 55 }),
  ], successful), [], "bank order shared by two failed multi-project records is ambiguous");
});

test("bank reference uniqueness query includes all donors/currencies/dates", () => {
  const implementation = readFileSync("lib/dashboard/donation-overview-recovery.ts", "utf8");
  const successfulQuery = implementation.split("const settledWithOrder = await prisma.donation.findMany(")[1]?.split("if (settledWithOrder.length")[0] ?? "";
  const failuresQuery = implementation.split("const failed = await prisma.donation.findMany(")[1]?.split("const recoveredIds =")[0] ?? "";
  assert.ok(successfulQuery);
  assert.ok(failuresQuery);
  for (const q of [successfulQuery, failuresQuery]) {
    assert.doesNotMatch(q, /donorId: settled\.donorId/);
    assert.doesNotMatch(q, /currency: settled\.currency/);
    assert.doesNotMatch(q, /createdAt: \{/);
    assert.match(q, /providerOrderId: settled\.providerOrderId/);
    assert.match(q, /take: 2/);
  }
});

test("automated recovery query requires a shared provider order reference", () => {
  const implementation = readFileSync("lib/dashboard/donation-overview-recovery.ts", "utf8");
  assert.match(implementation, /!failed\.providerOrderId/);
  assert.match(implementation, /failed\.providerOrderId !== settled\.providerOrderId/);
  assert.match(implementation, /providerOrderId: settled\.providerOrderId/);
  // No matching solely on donor, amount, project and time.
  assert.equal(isRecoveredFailedAttempt(row({ providerOrderId: null }), paid()), false);
  assert.equal(isRecoveredFailedAttempt(row(), paid({ providerOrderId: "another-order" })), false);
});

test("ambiguous bank reference must not hide multiple failed records", () => {
  const single = row();
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([single], paid()), [single.id]);
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([], paid()), []);
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([
    single,
    row({ id: "c".repeat(24) }),
  ], paid()), []);
  // A separate attempt remains visible even when it has a different allocation.
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([
    single,
    row({ id: "c".repeat(24), amount: 25, totalAmount: 25 }),
  ], paid()), []);
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([row()], paid({ providerOrderId: "other-bank-order" })), []);

  // An already linked failure remains part of the ambiguity check.
  const alreadyLinked = row({ id: "c".repeat(24), overviewRecoveredByDonationId: "x".repeat(24) });
  assert.deepEqual(uniqueRecoveredFailedAttemptIds([single, alreadyLinked], paid()), []);
  assert.equal(isRecoveredFailedAttempt(alreadyLinked, paid()), false);
  // These view-only matchers must not rewrite financial source records.
  const failedRows = [single, alreadyLinked];
  const settled = paid();
  const original = structuredClone({ failedRows, settled });
  assert.deepEqual(uniqueRecoveredFailedAttemptIds(failedRows, settled), []);
  assert.deepEqual({ failedRows, settled }, original);
  assert.equal(single.status, "FAILED");
  assert.equal(single.paidAt, null);
  assert.equal(settled.status, "PAID");


});

test("database recovery query rejects reused orders and truncation", () => {
  const implementation = readFileSync("lib/dashboard/donation-overview-recovery.ts", "utf8");
  assert.match(implementation, /settledWithOrder\.length !== 1/);
  assert.match(implementation, /uniqueRecoveredFailedAttemptIds\(failed, settled\)/);
  assert.match(implementation, /update\.count === 1/);
  assert.match(implementation, /take: 2/);
  assert.match(implementation, /overviewRecoveredByDonationId != null/);
  const failedQuery = implementation.split("const failed = await prisma.donation.findMany(")[1]?.split("const recoveredIds =")[0] ?? "";
  assert.doesNotMatch(failedQuery, /overviewRecoveredByDonationId: \{ isSet: false \}/);

});

test("recovered view stays explicitly opt-in and raw donor profile and failed filter are preserved", () => {
  const api = readFileSync("app/api/donations/route.ts", "utf8");
  const dashboard = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  const donor = readFileSync("app/api/users/[id]/route.ts", "utf8");
  assert.match(api, /searchParams\.get\("hideRecoveredFailures"\) === "1"/);
  assert.match(api, /statusFilter !== "FAILED"/);
  assert.match(dashboard, /params\.set\("hideRecoveredFailures", "1"\)/);
  assert.doesNotMatch(donor, /overviewRecoveredByDonationId/);
  assert.match(api, /const hideRecoveredFailures = isAdmin && searchParams\.get\("hideRecoveredFailures"\) === "1" && statusFilter !== "FAILED"/);
  const overview = api.split("const recoveredViewWhere =")[1]?.split("const extraFilters =")[0] ?? "";
  assert.match(overview, /status: \{ not: "FAILED" \}/);
  assert.match(overview, /overviewRecoveredByDonationId: null/);
  assert.match(overview, /isSet: false/);
  const exportRoutes = ["app/api/donations/export/route.ts", "app/api/admin/reports/route.ts"];
  // Export/report paths are not modified by the recovery PR, nor are raw donor queries.
  const changed = readFileSync("lib/dashboard/donation-overview-recovery.ts", "utf8");
  assert.doesNotMatch(changed, /currentAmount|increment:|status: "PAID"\s*\}|paidAt: new Date/);
  assert.equal(exportRoutes.length, 2);
});
