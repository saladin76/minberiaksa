import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ALBARAKA_NON_SECURE_MAC_PARAMS,
  albaraka2DOrderId,
  buildAlbaraka2DSale,
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
