import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIRMED_MINBAR_DONATION_WHERE, donationPageOutcome } from "../../lib/minbar/donation-outcome";

test("success summary requires both PAID and paidAt", () => {
  assert.deepEqual(CONFIRMED_MINBAR_DONATION_WHERE, { status: "PAID", paidAt: { not: null } });
  const summary = readFileSync("lib/minbar/donation.ts", "utf8");
  // Allow explanatory line comments between id and the confirmed-settlement constraint.
  assert.match(summary, /where:\s*\{\s*id,\s*(?:\/\/[^\n]*\n\s*)*\.\.\.CONFIRMED_MINBAR_DONATION_WHERE,?\s*\}/);
  assert.doesNotMatch(summary, /NOT:\s*\{\s*AND:\s*\[\{\s*provider:\s*"BANK_TRANSFER"/);
});

test("confirmed success is never inferred from the optimistic PAID state", () => {
  const paidAt = new Date("2026-11-08T12:00:00Z");
  assert.equal(donationPageOutcome({ status: "PAID", paidAt, provider: "ALBARAKA" }), "CONFIRMED");
  assert.equal(donationPageOutcome({ status: "PAID", paidAt, provider: "BANK_TRANSFER" }), "CONFIRMED");
  for (const provider of ["ALBARAKA", "PAYPAL", "STRIPE", "PAYFOR", null]) {
    assert.equal(donationPageOutcome({ status: "PAID", paidAt: null, provider }), "PENDING_PAYMENT");
  }
  assert.equal(donationPageOutcome({ status: "PAID", paidAt: null, provider: "BANK_TRANSFER" }), "PENDING_TRANSFER");
  assert.equal(donationPageOutcome({ status: "FAILED", paidAt: null, provider: "PAYPAL" }), "FAILED");
  assert.equal(donationPageOutcome({ status: "FAILED", paidAt, provider: "PAYPAL" }), "INCONSISTENT");
  assert.equal(donationPageOutcome(null), "NOT_FOUND");
});

test("success page verifies access before provider reconciliation and redirects pending outcomes", () => {
  const page = readFileSync("app/[locale]/success/[id]/page.tsx", "utf8");
  const access = page.indexOf("await donationAccess(id, token)");
  const provider = page.indexOf("await reconcileStripeDonation(id)");
  assert.ok(access >= 0 && provider > access, "provider inquiry must follow access control");
  assert.match(page, /donationPageOutcome\(row\)/);
  assert.match(page, /outcome === "PENDING_PAYMENT"/);
  assert.match(page, /outcome === "PENDING_TRANSFER"/);
  assert.match(page, /outcome === "FAILED"/);
});

test("public success summary never serializes a bearer receipt token into RSC client props", () => {
  const summary = readFileSync("lib/minbar/donation.ts", "utf8");
  const page = readFileSync("app/[locale]/success/[id]/page.tsx", "utf8");
  assert.doesNotMatch(summary, /accessToken:\s*true/);
  assert.doesNotMatch(summary, /accessToken:\s*row\.accessToken/);
  assert.doesNotMatch(summary, /accessToken:\s*string\s*\|\s*null/);
  assert.match(page, /accessToken=\{token\s*\?\?\s*null\}/);
});
