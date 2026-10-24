import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { manualDonationRecordFields } from "../../lib/donations/manual-donation-provider";

test("manual donations save the chosen platform as source without changing the payment rail", () => {
  for (const provider of ["BANK", "PAYFOR", "ALBARAKA", "STRIPE", "PAYPAL", "CHARITY_GIVING"] as const) {
    assert.deepEqual(manualDonationRecordFields(provider), { paymentMethod: "CARD", provider });
  }
});

test("the donation list chooses its logo from the recorded source, not payment method", () => {
  const badge = readFileSync("components/dashboard/DonationGatewayBadge.tsx", "utf8");
  assert.match(badge, /const provider = donation\.provider \?\? null/);
  assert.match(badge, /GATEWAY_LOGOS\[provider\]/);
  assert.match(badge, /PAYPAL: \{ src: "\/paypal\.webp"/);
  assert.match(badge, /CHARITY_GIVING: \{ src: "\/charity-giving\.png"/);
});
