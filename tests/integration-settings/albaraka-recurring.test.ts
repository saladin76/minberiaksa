import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ALBARAKA_NON_SECURE_MAC_PARAMS,
  albarakaExpiryFromStored,
  albarakaNonSecureSaleMac,
  albarakaRecurringOrderId,
  buildAlbarakaRecurringSale,
  isAlbarakaRecurringEnabled,
  isStoredCardExpired,
  type AlbarakaRecurringConfig,
} from "../../lib/albaraka";

/**
 * The Albaraka scheduler's bank-facing contract, pinned without a bank:
 * the order id that makes a cycle un-repeatable, the MAC the document
 * specifies for a standard sale, the recurring flags on the payload, and
 * the card-expiry rules that stop a charge before it is attempted.
 */

const cfg: AlbarakaRecurringConfig = {
  merchantNo: "6700950031",
  terminalNo: "67540050",
  posnetId: "1010054515195582",
  encKey: "10,10,10,10,10,10,10,10",
  tdsUrl: "https://example.invalid/tds",
  serviceUrl: "https://example.invalid/svc",
  useOOS: false,
  useJokerVadaa: false,
  enabled: true,
};

test("recurring order ids are 24 characters, deterministic per cycle+attempt, and never reused across cycles", () => {
  const a = albarakaRecurringOrderId("6ab016966bda310f6a1f6c56", "2026-09-25T06:00:00.000Z", 1);
  assert.equal(a.length, 24);
  assert.match(a, /^[0-9A-F]{24}$/);
  assert.equal(albarakaRecurringOrderId("6ab016966bda310f6a1f6c56", "2026-09-25T06:00:00.000Z", 1), a);
  assert.notEqual(albarakaRecurringOrderId("6ab016966bda310f6a1f6c56", "2026-09-25T06:00:00.000Z", 2), a);
  assert.notEqual(albarakaRecurringOrderId("6ab016966bda310f6a1f6c56", "2026-10-02T06:00:00.000Z", 1), a);
  assert.notEqual(albarakaRecurringOrderId("000000000000000000000000", "2026-09-25T06:00:00.000Z", 1), a);
});

test("standard-sale MAC: plain SHA256 over the MACParams values concatenated, key appended, Base64", () => {
  const params = { merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo, cardNo: "5400619360964581", cvc2: "", expireDate: "2612", amount: 17500 };
  const expected = crypto
    .createHash("sha256")
    .update(`${params.merchantNo}${params.terminalNo}${params.cardNo}${params.expireDate}${params.amount}${cfg.encKey}`, "utf8")
    .digest("base64");
  assert.equal(albarakaNonSecureSaleMac(params, cfg.encKey), expected);
  assert.equal(ALBARAKA_NON_SECURE_MAC_PARAMS, "MerchantNo:TerminalNo:CardNo:Cvc2:ExpireDate:Amount");
  // An absent CVC takes part as an empty string — it must not shift the concatenation.
  assert.equal(albarakaNonSecureSaleMac({ ...params, cvc2: "" }, cfg.encKey), albarakaNonSecureSaleMac(params, cfg.encKey));
  assert.notEqual(albarakaNonSecureSaleMac({ ...params, amount: 17501 }, cfg.encKey), expected);
});

test("the scheduled /Sale payload is a merchant-initiated recurring charge on a stored card", () => {
  const orderId = albarakaRecurringOrderId("6ab016966bda310f6a1f6c56", "2026-09-25T06:00:00.000Z", 1);
  const body = buildAlbarakaRecurringSale(
    { orderId, amount: 17500, currencyCode: "TL", card: { number: "5400619360964581", expireDate: "2612", holderName: "Test Donor" } },
    cfg
  ) as Record<string, unknown> & { CardInformationData: Record<string, string> };

  assert.equal(body.IsRecurring, "Y");
  assert.equal(body.IsMailOrder, "Y");
  assert.equal(body.IsTDSecureMerchant, "N");
  assert.equal(body.ThreeDSecureData, null);
  assert.equal(body.CardInformationData.Cvc2, "", "a stored card has no CVC to send");
  assert.equal(body.CardInformationData.CardNo, "5400619360964581");
  assert.equal(body.CardInformationData.ExpireDate, "2612");
  assert.equal(body.OrderId, orderId);
  assert.equal((body.OrderId as string).length, 24, "non-3D orders are 24 characters");
  assert.equal(body.Amount, "17500");
  assert.equal(body.CurrencyCode, "TL");
  assert.equal(body.InstallmentCount, "0");
  assert.equal(body.MACParams, ALBARAKA_NON_SECURE_MAC_PARAMS);
  assert.equal(body.MerchantNo, cfg.merchantNo);
  assert.equal(body.TerminalNo, cfg.terminalNo);
  assert.equal(
    body.MAC,
    albarakaNonSecureSaleMac({ merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo, cardNo: "5400619360964581", cvc2: "", expireDate: "2612", amount: 17500 }, cfg.encKey)
  );
});

test("stored MM/YY becomes the bank's YYMM; malformed values become empty", () => {
  assert.equal(albarakaExpiryFromStored("12/26"), "2612");
  assert.equal(albarakaExpiryFromStored("0129"), "2901");
  assert.equal(albarakaExpiryFromStored("1/26"), "");
  assert.equal(albarakaExpiryFromStored(""), "");
});

test("a card is usable through the last day of its expiry month and dead from the first of the next", () => {
  assert.equal(isStoredCardExpired("09/26", new Date("2026-09-30T23:59:59Z")), false);
  assert.equal(isStoredCardExpired("09/26", new Date("2026-10-01T00:00:00Z")), true);
  assert.equal(isStoredCardExpired("01/20", new Date("2026-09-23T00:00:00Z")), true);
  assert.equal(isStoredCardExpired("13/26", new Date("2026-09-23T00:00:00Z")), true, "an impossible month is not a valid card");
  assert.equal(isStoredCardExpired("", new Date("2026-09-23T00:00:00Z")), true);
});

test("the scheduler is off unless explicitly enabled AND the terminal is configured", () => {
  assert.equal(isAlbarakaRecurringEnabled(cfg), true);
  assert.equal(isAlbarakaRecurringEnabled({ ...cfg, enabled: false }), false);
  assert.equal(isAlbarakaRecurringEnabled({ ...cfg, encKey: "short" }), false);
  assert.equal(isAlbarakaRecurringEnabled({ ...cfg, terminalNo: "" }), false);
});
