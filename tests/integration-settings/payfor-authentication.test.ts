import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyPayForResponseHash } from "../../lib/payfor";

test("PayFor callback signature authenticates linked reply and rejects tampering", () => {
  const password = "synthetic-fixture-not-a-real-secret";
  const response: Record<string, unknown> = {
    MerchantID: "fixture-merchant",
    OrderId: "test-order-123",
    AuthCode: "",
    ProcReturnCode: "05",
    ResponseRnd: "fixture-random",
  };
  const signed = [response.MerchantID, password, response.OrderId, response.AuthCode,
    response.ProcReturnCode, response.ResponseRnd].join("");
  response.ResponseHash = createHash("sha1").update(signed, "utf8").digest("base64");
  assert.equal(verifyPayForResponseHash(response, password), true);
  assert.equal(verifyPayForResponseHash({ ...response, ProcReturnCode: "00" }, password), false);
  assert.equal(verifyPayForResponseHash({ ...response, OrderId: "other-order" }, password), false);
  assert.equal(verifyPayForResponseHash({ ...response, ResponseHash: "" }, password), false);
  assert.equal(verifyPayForResponseHash(response, undefined), false);
});

test("unsigned PayFor fail redirect is not allowed to mutate payment or count fraud", () => {
  const code = readFileSync("app/api/payfor/3dpay/fail/route.ts", "utf8");
  const signedAt = code.indexOf("verifyPayForResponseHash(raw, process.env.PAYFOR_MERCHANT_PASS)");
  const writeAt = code.indexOf("prisma.donation.update(");
  assert.ok(signedAt >= 0 && writeAt > signedAt);
  assert.match(code, /recordSignedPayForDecline\(raw, donation\)/);
});

test("verified decline adapter requires exact bank order linkage", () => {
  const code = readFileSync("lib/site-security/payfor-verified-decline.ts", "utf8");
  assert.match(code, /donation.providerOrderId !== orderId/);
  assert.match(code, /VERIFIED_PAYFOR_DECLINES\.has\(code\)/);
  assert.match(code, /verifyPayForResponseHash\(response, process.env.PAYFOR_MERCHANT_PASS\)/);
  assert.match(code, /DONATION_ABUSE_GUARD_ENABLED !== "true"/);
});
