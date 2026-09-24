import test from "node:test";
import assert from "node:assert/strict";
import { expectedLocalStatusFor, planRail } from "../../lib/donations/subscription-provider-rules";

/* The dashboard used to change Subscription.status in the database only, so a
   plan "cancelled" there kept being charged by Stripe. Cancel/pause now go to
   the plan's payment provider first. These pin which provider a plan is on and
   how Stripe's state maps back onto the local status (the SYNC ERROR check). */

test("planRail: Albaraka plans are billed by the site's own scheduler", () => {
  assert.equal(planRail({ id: "a", provider: "ALBARAKA", stripeSubscriptionId: null }), "ALBARAKA");
  // Even if a stray Stripe id is present, the recorded provider wins.
  assert.equal(planRail({ id: "a", provider: "ALBARAKA", stripeSubscriptionId: "sub_x" }), "ALBARAKA");
});

test("planRail: a Stripe id in either field means Stripe, including legacy payforToken rows", () => {
  assert.equal(planRail({ id: "a", stripeSubscriptionId: "sub_123" }), "STRIPE");
  assert.equal(planRail({ id: "a", payforToken: "sub_legacy" }), "STRIPE");
  assert.equal(planRail({ id: "a", provider: "STRIPE", stripeSubscriptionId: "sub_1" }), "STRIPE");
});

test("planRail: a plan whose checkout never completed has no provider to call", () => {
  assert.equal(planRail({ id: "a", provider: null, stripeSubscriptionId: null, payforToken: null }), "NONE");
});

test("expectedLocalStatusFor maps Stripe's view onto the local status", () => {
  assert.equal(expectedLocalStatusFor("canceled", false), "CANCELLED");
  assert.equal(expectedLocalStatusFor("incomplete_expired", false), "CANCELLED");
  assert.equal(expectedLocalStatusFor("active", true), "PAUSED");
  assert.equal(expectedLocalStatusFor("active", false), "ACTIVE");
  assert.equal(expectedLocalStatusFor("past_due", false), "ACTIVE");
  assert.equal(expectedLocalStatusFor("trialing", false), "ACTIVE");
});

test("expectedLocalStatusFor does not call a transitional state a mismatch", () => {
  assert.equal(expectedLocalStatusFor("incomplete", false), null);
  assert.equal(expectedLocalStatusFor("unpaid", false), null);
});

test("a cancelled Stripe plan is CANCELLED even if pause_collection was left set", () => {
  assert.equal(expectedLocalStatusFor("canceled", true), "CANCELLED");
});
