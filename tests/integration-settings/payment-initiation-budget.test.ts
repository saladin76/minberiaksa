import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path: string) => readFileSync(path, "utf8");
test("all selected interactive payment initiations enforce the shared budget", () => {
  for (const name of ["stripe/intent","stripe/charge","payfor/3dpay/initiate","albaraka/3d/initiate"]) {
    const source = read("app/api/" + name + "/route.ts");
    assert.match(source, /enforcePaymentInitiationBudget\(/, name);
  }
});
test("card intake checks precede guest donor creation", () => {
  for (const path of ["app/api/cart/payment/route.ts", "app/api/donations/route.ts"]) {
    const source = read(path);
    assert.match(source, /enforceDonationIntakeBudget\(request\)/);
    assert.ok(source.indexOf("enforceDonationIntakeBudget(request)") < source.indexOf("resolveGuestDonor("));
  }
});
test("rate limits use an atomic database command, no fake success", () => {
  const source = read("lib/site-security/payment-initiation-budget.ts");
  assert.match(source, /findAndModify/);
  assert.match(source, /status: 429/);
  assert.match(source, /status: 503/);
});
