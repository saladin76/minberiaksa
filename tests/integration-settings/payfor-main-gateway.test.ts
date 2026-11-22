import test from "node:test";
import assert from "node:assert/strict";
import { resolveGateway, isMainGateway, parseMainGateway } from "../../lib/payment-gateway";
import { decideNewCardRoute } from "../../lib/donations/payment-routing";
const one = (mainGateway: "STRIPE" | "ALBARAKA" | "PAYFOR", currency: string, payforEnabled = true) => resolveGateway({ mainGateway, payforEnabled, currency, donationType: "ONE_TIME" });
test("PayFor as main gateway: one-time cards in every currency, recurring stays on Albaraka, falls back when PayFor is off", () => {
  assert.equal(isMainGateway("PAYFOR"), true); assert.equal(parseMainGateway("PAYFOR"), "PAYFOR");
  for (const c of ["USD", "EUR", "TRY", "GBP"]) assert.equal(one("PAYFOR", c), "PAYFOR", c);
  assert.equal(resolveGateway({ mainGateway: "PAYFOR", payforEnabled: true, currency: "USD", donationType: "MONTHLY" }), "ALBARAKA");
  assert.equal(one("PAYFOR", "USD", false), "ALBARAKA", "never a disabled rail");
});
test("nothing changes for Albaraka or Stripe as main", () => {
  assert.equal(one("ALBARAKA", "USD"), "ALBARAKA"); assert.equal(one("ALBARAKA", "TRY"), "PAYFOR"); assert.equal(one("STRIPE", "USD"), "STRIPE");
});
test("routing snapshot: PayFor main is the baseline; a donor pinned to Albaraka still goes to Albaraka", () => {
  const base = decideNewCardRoute({ mainGateway: "PAYFOR", payforEnabled: true, saudiEnabled: false, currency: "USD" });
  assert.equal(base.gateway, "PAYFOR"); assert.equal(base.reason, "DEFAULT");
  const pinned = decideNewCardRoute({ mainGateway: "PAYFOR", payforEnabled: true, saudiEnabled: false, currency: "USD", donorOverride: "ALBARAKA" });
  assert.equal(pinned.gateway, "ALBARAKA");
});
