import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  formatPayForPurchAmount,
  mergePayForProviderRaw,
  payForCurrencyCode,
  payForHash,
  payForLang,
  redactPayForResponse,
} from "../../lib/payfor";

/**
 * Contract tests for the Ziraat Katılım PayFor rail.
 *
 * The hash is the piece the bank checks before it will show a 3D page at all, so a
 * change to its inputs or its digest fails every payment with nothing to see
 * locally. The redactor is here because the callbacks log the bank's whole POST
 * body, and a card number reaching the log stream cannot be taken back.
 */

const PASS = "Hwk4m842";

test("the 3DPay hash is base64 SHA1 over the documented field order", () => {
  const params = {
    mbrId: "12",
    orderId: "68b0f3c2a1d4e5f60718293a",
    purchAmount: "10.00",
    okUrl: "https://example.invalid/api/payfor/3dpay/ok",
    failUrl: "https://example.invalid/api/payfor/3dpay/fail",
    txnType: "Auth",
    installmentCount: "0",
    rnd: "abcdef0123456789",
    merchantPass: PASS,
  };
  const expected = crypto
    .createHash("sha1")
    .update(
      params.mbrId +
        params.orderId +
        params.purchAmount +
        params.okUrl +
        params.failUrl +
        params.txnType +
        params.installmentCount +
        params.rnd +
        params.merchantPass,
      "utf8"
    )
    .digest("base64");

  assert.equal(payForHash(params), expected);
  // Base64, not hex — the bank rejects a hex digest outright.
  assert.match(payForHash(params), /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(Buffer.from(payForHash(params), "base64").length, 20);
});

test("every hash input actually changes the hash", () => {
  const base = {
    mbrId: "12",
    orderId: "A",
    purchAmount: "10.00",
    okUrl: "https://ok.invalid",
    failUrl: "https://fail.invalid",
    txnType: "Auth",
    installmentCount: "0",
    rnd: "R",
    merchantPass: PASS,
  };
  const reference = payForHash(base);
  for (const key of Object.keys(base) as Array<keyof typeof base>) {
    assert.notEqual(
      payForHash({ ...base, [key]: base[key] + "x" }),
      reference,
      `${key} is not affecting the hash`
    );
  }
});

test("amounts are sent as dot-decimal with two places", () => {
  assert.equal(formatPayForPurchAmount(10), "10.00");
  assert.equal(formatPayForPurchAmount(10.5), "10.50");
  assert.equal(formatPayForPurchAmount(0.1 + 0.2), "0.30");
  assert.equal(formatPayForPurchAmount(0), "0.00");
  assert.equal(formatPayForPurchAmount(-1), "0.00");
  assert.equal(formatPayForPurchAmount(Number.NaN), "0.00");
});

test("currency and language map to the bank's codes", () => {
  assert.equal(payForCurrencyCode("TRY"), "949");
  assert.equal(payForCurrencyCode("EUR"), "978");
  assert.equal(payForCurrencyCode("USD"), "840");
  assert.equal(payForLang("tr"), "TR");
  assert.equal(payForLang("ar"), "EN");
  assert.equal(payForLang(undefined), "EN");
});

test("card data and secrets never survive into a log", () => {
  const safe = redactPayForResponse({
    OrderId: "68b0f3c2a1d4e5f60718293a",
    ProcReturnCode: "00",
    AuthCode: "123456",
    Pan: "4155650100416111",
    CardNumber: "4155650100416111",
    Cvv2: "123",
    Expiry: "1230",
    MerchantPass: PASS,
    Hash: "abc123def456",
  });

  assert.equal(safe.OrderId, "68b0f3c2a1d4e5f60718293a");
  assert.equal(safe.ProcReturnCode, "00");
  assert.equal(safe.AuthCode, "123456");

  for (const key of ["Pan", "CardNumber", "Cvv2", "Expiry", "MerchantPass", "Hash"]) {
    const value = String(safe[key]);
    assert.match(value, /^\*\*\*/, `${key} was not redacted`);
    assert.equal(value.includes(PASS), false, `${key} leaked the merchant password`);
  }
  assert.equal(String(safe.Pan).includes("4155650100416111"), false);
  // The last four stay, because that is what makes a log useful for matching a receipt.
  assert.equal(safe.Pan, "***6111");
});

test("recording a bank response keeps the request snapshot", () => {
  // The amount check reads payforRequest; a callback that overwrote providerRaw
  // wholesale left it with nothing to compare against.
  const existing = { payforRequest: { orderId: "A", purchAmount: "10.00" } };
  const merged = mergePayForProviderRaw(existing, { ProcReturnCode: "00" });

  assert.deepEqual(merged.payforRequest, { orderId: "A", purchAmount: "10.00" });
  assert.deepEqual(merged.payforResponse, { ProcReturnCode: "00" });

  // And it copes with a donation that has no snapshot yet.
  assert.deepEqual(mergePayForProviderRaw(null, { a: 1 }), { payforResponse: { a: 1 } });
  assert.deepEqual(mergePayForProviderRaw("junk", { a: 1 }), { payforResponse: { a: 1 } });
});
