import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ALBARAKA_NON_SECURE_MAC_PARAMS,
  albaraka2DOrderId,
  albarakaInquiryMac,
  albarakaIsoCode,
  albarakaReverseMac,
  buildAlbaraka2DSale,
  isValidBankExpiry,
  isValidCardNumber,
  type AlbarakaConfig,
} from "../../lib/albaraka";

/**
 * The checkout's 2D (non-3D) Albaraka sale, pinned without a bank: a fresh
 * 24-character order id, a donor-present sale (card with its CVC, neither 3D
 * nor mail-order nor recurring), and the standard-sale MAC over the six
 * parameters the document names.
 */

const cfg: AlbarakaConfig = {
  merchantNo: "6700950031",
  terminalNo: "67540050",
  posnetId: "1010054515195582",
  encKey: "10,10,10,10,10,10,10,10",
  tdsUrl: "https://example.invalid/tds",
  serviceUrl: "https://example.invalid/svc",
  useOOS: false,
  useJokerVadaa: false,
};

test("2D order ids are 24 uppercase hex characters and fresh every time", () => {
  const a = albaraka2DOrderId();
  assert.match(a, /^[0-9A-F]{24}$/);
  assert.notEqual(albaraka2DOrderId(), a);
});

test("a 2D sale carries the card with its CVC and no 3D, mail-order or recurring flags", () => {
  const body = buildAlbaraka2DSale(
    {
      orderId: "0123456789ABCDEF01234567",
      amount: 4900,
      currencyCode: "TL",
      card: { number: "5400619360964581", expireDate: "2612", cvc2: "123", holderName: "Test Donor" },
    },
    cfg
  ) as Record<string, unknown> & { CardInformationData: Record<string, string> };

  assert.equal(body.IsTDSecureMerchant, "N");
  assert.equal(body.IsMailOrder, "N");
  assert.equal(body.IsRecurring, undefined);
  assert.equal(body.ThreeDSecureData, null);
  assert.equal(body.CardInformationData.CardNo, "5400619360964581");
  assert.equal(body.CardInformationData.Cvc2, "123");
  assert.equal(body.CardInformationData.ExpireDate, "2612");
  assert.equal(body.Amount, "4900");
  assert.equal(body.CurrencyCode, "TL");
  assert.equal(body.OrderId, "0123456789ABCDEF01234567");
  assert.equal(body.MACParams, ALBARAKA_NON_SECURE_MAC_PARAMS);

  // MerchantNo + TerminalNo + CardNo + Cvc2 + ExpireDate + Amount + key, plain SHA256.
  const expected = crypto
    .createHash("sha256")
    .update(cfg.merchantNo + cfg.terminalNo + "5400619360964581" + "123" + "2612" + "4900" + cfg.encKey, "utf8")
    .digest("base64");
  assert.equal(body.MAC, expected);
});

test("the standard-sale MAC matches the document's worked example", () => {
  const body = buildAlbaraka2DSale(
    {
      orderId: "ALB_TST_19092200_2011234",
      amount: 175,
      currencyCode: "TL",
      card: { number: "5400619360964581", expireDate: "2001", cvc2: "056", holderName: "deneme deneme" },
    },
    { ...cfg, merchantNo: "6700950031", terminalNo: "67540050" }
  );
  assert.equal(body.MAC, "xuhPbpcPJ6kVs7JeIXS8f06Cv0mb9cNPMfjp1HiB7Ew=");
});

test("inquiry and void MACs match the document's worked examples", () => {
  const ids = { merchantNo: "6700950031", terminalNo: "67540050" };
  assert.equal(albarakaInquiryMac(ids, cfg.encKey), "wgyfAJPbEPtTtce/+HRlXajSRfYA0J6mUcH+16EbB78=");
  assert.equal(
    albarakaReverseMac({ ...ids, referenceCode: "021459486690000191", orderId: null }, cfg.encKey),
    "qhLo/2Ro+vT81i0SMV/VHifDV9VzQQgK+7d8hlId9YM="
  );
  assert.equal(
    albarakaReverseMac({ ...ids, referenceCode: null, orderId: "TDS_ALB_TST_19092400_x08" }, cfg.encKey),
    "ir8JtPc5W3zbI3JCQ1byVWQueGwA8CozMo1yEI+rwiQ="
  );
  assert.equal(
    albarakaReverseMac({ ...ids, referenceCode: "021459488990000191", orderId: "ALB_TST_19092400_x08_000" }, cfg.encKey),
    "9Z4ylM+S+8/vCp4hPZ5LBEz/FSsbrwzlzfHrfZIQNJQ="
  );
});

test("card number and expiry are validated before the bank is asked", () => {
  assert.equal(isValidCardNumber("5400619360964581"), true);
  assert.equal(isValidCardNumber("4111111111111111"), true);
  assert.equal(isValidCardNumber("4111111111111112"), false);
  assert.equal(isValidCardNumber("1234"), false);

  const now = new Date(Date.UTC(2026, 9, 4));
  assert.equal(isValidBankExpiry("2610", now), true); // October 2026: still valid this month
  assert.equal(isValidBankExpiry("2609", now), false);
  assert.equal(isValidBankExpiry("2613", now), false);
  assert.equal(isValidBankExpiry("261", now), false);
});

test("four-digit bank codes normalise to their ISO-8583 code", () => {
  assert.equal(albarakaIsoCode("0051"), "51");
  assert.equal(albarakaIsoCode("51"), "51");
  assert.equal(albarakaIsoCode("0148"), "0148");
  assert.equal(albarakaIsoCode("E219"), "E219");
});
