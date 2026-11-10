import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRecoveredFailedAttempt, DONATION_RECOVERY_WINDOW_MS, type RecoveryDonation } from "../../lib/dashboard/donation-overview-recovery";

const at = new Date("2026-11-09T19:56:00.000Z");
const row = (overrides: Record<string, unknown> = {}): RecoveryDonation => ({
  id: "a".repeat(24),
  donorId: "d".repeat(24),
  status: "FAILED",
  paidAt: null,
  createdAt: at,
  subscriptionId: null,
  paymentMethod: "CARD",
  provider: "ALBARAKA",
  providerOrderId: "provider-intent-unique-001",
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
} as RecoveryDonation);

const paid = (overrides: Record<string, unknown> = {}): RecoveryDonation =>
  row({ id: "b".repeat(24), status: "PAID", paidAt: new Date("2026-11-09T20:00:00Z"), createdAt: new Date("2026-11-09T19:59:00Z"), ...overrides });

test("only a provider-correlated later payment supersedes an overview failure", () => {
  assert.equal(isRecoveredFailedAttempt(row(), paid()), true);
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
    paid({ items: [{ campaignId: "q".repeat(24), amount: 55, giftChannels: [], giftShowAmount: true }] }),
    paid({ items: [{ campaignId: "p".repeat(24), amount: 55, giftRecipientName: "Other", giftChannels: [], giftShowAmount: true }] }),
    paid({ items: [{ campaignId: "p".repeat(24), amount: 55, giftRecipientName: null, giftChannels: ["EMAIL"], giftShowAmount: true }] }),
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

test("automated recovery query requires a shared provider order reference", () => {
  const implementation = readFileSync("lib/dashboard/donation-overview-recovery.ts", "utf8");
  assert.match(implementation, /!failed\\.providerOrderId/);
  assert.match(implementation, /failed\\.providerOrderId !== settled\\.providerOrderId/);
  assert.match(implementation, /providerOrderId: settled\\.providerOrderId/);
  // No matching solely on donor, amount, project and time.
  assert.equal(isRecoveredFailedAttempt(row({ providerOrderId: null }), paid()), false);
  assert.equal(isRecoveredFailedAttempt(row(), paid({ providerOrderId: "another-order" })), false);
});

test("recovered view stays explicitly opt-in and raw donor profile and failed filter are preserved", () => {
  const api = readFileSync("app/api/donations/route.ts", "utf8");
  const dashboard = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  const donor = readFileSync("app/api/users/[id]/route.ts", "utf8");
  assert.match(api, /searchParams\.get\("hideRecoveredFailures"\) === "1"/);
  assert.match(api, /statusFilter !== "FAILED"/);
  assert.match(dashboard, /params\.set\("hideRecoveredFailures", "1"\)/);
  assert.doesNotMatch(donor, /overviewRecoveredByDonationId/);
});
