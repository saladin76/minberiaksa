import * as subscriptionLifecycle from "../../lib/donations/subscription-lifecycle";
import { donationListSafeFields } from "../../lib/dashboard/donation-list-privacy";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
// Prisma-shaped rows stay inside this isolated route fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const privateKeys = [
  "bankOperations", "bankOperationLock", "bankOperationsRevision", "bankLastInquiry",
  "accessToken", "providerRaw", "cardDetails", "reconciliationLeaseToken", "originalDonorId",
];
const donorId = "2".repeat(24), donationId = "1".repeat(24);
const donation: Row = {
  id: donationId, donorId, status: "PAID", paidAt: new Date(), createdAt: new Date(),
  amount: 10, subscriptionId: null, subscription: null, items: [],
  accessToken: "PRIVATE-GUEST-BEARER", cardDetails: { cardNumber: "PRIVATE-PAN", cvv: "PRIVATE-CVV" },
  providerRaw: { request: "PRIVATE-GATEWAY-REQUEST" }, originalDonorId: "PRIVATE-IDENTITY-LINK",
  reconciliationLeaseToken: "PRIVATE-RECONCILIATION-LEASE",
  bankOperations: [{ reason: "PRIVATE-ADMIN-EVIDENCE" }],
  bankOperationLock: "PRIVATE-LOCK", bankOperationsRevision: 1, bankLastInquiry: { actorId: "PRIVATE-ACTOR" },
};
function project(row: Row, omit: Row) { return Object.fromEntries(Object.entries(row).filter(([key]) => !omit?.[key])); }
function load(file: string, prisma: Row) {
  const loaded = { exports: {} as Row };
  const deps: Row = {
    "@/lib/donations/subscription-lifecycle": subscriptionLifecycle,
    "next/server": { NextResponse: { json: (body: Row, options: Row = {}) => ({ body, status: options.status || 200 }) } },
    "next-auth": { getServerSession: async () => ({ user: { id: donorId, role: "DONOR" } }) },
    "@/lib/prisma": { prisma },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => false, userCanViewUserProfilesInDashboard: () => false },
    "@/lib/dashboard/api-auth": { isRevenueDashboardUser: () => false },
    "@/lib/dashboard/donation-list-privacy": { donationListSafeFields },
    "@/lib/donations/reconcile-stripe-donation": { reconcileStripeDonation: async () => {} },
    "@/lib/dashboard/donor-account": { donorAccountStatus: () => "REGISTERED" },
    "@/lib/dashboard/donation-financial-summary": { loadDonationFinancialSummaries: async () => new Map([[donationId, {state:"REFUNDED",returnedMinor:1000,remainingMinor:0,currency:"USD"}]]) },
  };
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, URL, Date, Set, Map, console: { error() {} }, require: (name: string) => deps[name] || {} });
  return loaded.exports;
}
function assertPrivate(response: Row) {
  assert.equal(response.status, 200);
  const text = JSON.stringify(response.body);
  for (const key of privateKeys) assert.equal(text.includes(key), false, key);
  assert.equal(text.includes("PRIVATE-"), false);
}
test("donation owners receive their payment without administrator bank ledger or lock fields", async () => {
  const route = load("app/api/donations/[id]/route.ts", { donation: { findUnique: async ({ omit }: Row) => project(donation, omit) } });
  const result = await route.GET({ nextUrl: new URL("https://example.invalid/api/donations/" + donationId) }, { params: Promise.resolve({ id: donationId }) });
  assertPrivate(result); assert.equal(result.body.amount, 10);
});
test("personal account donation history excludes internal bank evidence at the database projection", async () => {
  const route = load("app/api/users/[id]/route.ts", {
    user: { findUnique: async ({ include }: Row) => ({ id: donorId, name: "Donor", password: null, donations: [project(donation, include.donations.omit)], _count: { accounts: 0 } }) },
    donation: { groupBy: async () => [] }, badge: { findMany: async () => [] }, subscription: { findMany: async () => [] },
  });
  const result = await route.GET({}, { params: Promise.resolve({ id: donorId }) });
  assertPrivate(result); assert.equal(result.body.user.donations[0].amount, 10);
  assert.equal(result.body.user.donations[0].financialSummary.state, "REFUNDED");
});
