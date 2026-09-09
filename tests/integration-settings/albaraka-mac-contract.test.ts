import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  ALBARAKA_FORM_FIELDS,
  ALBARAKA_PAYMENT_MAC_PARAMS,
  ALBARAKA_RESPONSE_MAC_FIELDS,
  albarakaConfig,
  albarakaCurrencyCode,
  albarakaFormMac,
  albarakaMinorUnits,
  albarakaOrderId,
  albarakaPaymentMac,
  albarakaResponseMac,
  isAlbarakaApproved,
  isAlbarakaConfigured,
  type AlbarakaFormFields,
} from "../../lib/albaraka";

/**
 * Contract tests for the Albaraka Türk EPOS MACs.
 *
 * These do not re-verify the algorithms against the bank's worked examples — those
 * vectors carry a live encryption key and can't live in the repo. What they pin is
 * the shape of the contract, which is where a silent regression would land: the
 * failure mode of a reordered field list or an HMAC/SHA256 mix-up is that every
 * real payment is rejected by the bank with no local error to point at.
 */

const KEY = "TESTENCKEY123456";

function formFields(overrides: Partial<AlbarakaFormFields> = {}): AlbarakaFormFields {
  const base = {} as AlbarakaFormFields;
  for (const name of ALBARAKA_FORM_FIELDS) base[name] = "";
  return Object.assign(base, overrides);
}

test("the 3D form's signed field list is exactly the bank's order", () => {
  // The MAC is computed over values in this order and the hidden inputs are emitted
  // from the same array, so a change here silently invalidates every form.
  assert.deepEqual(
    [...ALBARAKA_FORM_FIELDS],
    [
      "PosnetID",
      "MerchantNo",
      "TerminalNo",
      "OrderId",
      "TransactionType",
      "CardNo",
      "ExpiredDate",
      "Cvv",
      "CardHolderName",
      "Amount",
      "InstallmentCount",
      "MerchantReturnURL",
      "Language",
      "CurrencyCode",
      "UseJokerVadaa",
      "KOICode",
      "OpenNewWindow",
      "UseOOS",
      "TxnState",
      "VftCode",
      "gsmNo",
      "packetCode",
    ]
  );
});

test("the callback MAC's field list is exactly the bank's order", () => {
  assert.deepEqual(
    [...ALBARAKA_RESPONSE_MAC_FIELDS],
    [
      "CCPrefix",
      "TranType",
      "Amount",
      "OrderId",
      "MerchantId",
      "CAVV",
      "CAVVAlgorithm",
      "ECI",
      "MD",
      "MdErrorMessage",
      "MdStatus",
      "SecureTransactionId",
      "Currency",
    ]
  );
});

test("unsent fields still occupy their separator position", () => {
  // Ortak Ödeme Sayfası sends the four card fields empty. If an absent field were
  // dropped rather than joined as "", every later value would shift one separator
  // left and the bank would reject the form.
  const explicit = formFields({ OrderId: "ABC", Amount: "1000" });
  const partial = { OrderId: "ABC", Amount: "1000" } as unknown as AlbarakaFormFields;

  assert.equal(albarakaFormMac(partial, KEY), albarakaFormMac(explicit, KEY));

  // And the separators really are there: 22 values → 21 separators, plus the one
  // before the appended key.
  const message = ALBARAKA_FORM_FIELDS.map((n) => explicit[n]).join(";") + ";" + KEY;
  assert.equal(message.split(";").length, ALBARAKA_FORM_FIELDS.length + 1);
  assert.equal(
    albarakaFormMac(explicit, KEY),
    crypto.createHmac("sha256", KEY).update(message, "utf8").digest("base64")
  );
});

test("a shifted value produces a different form MAC", () => {
  const a = albarakaFormMac(formFields({ CardNo: "4", ExpiredDate: "" }), KEY);
  const b = albarakaFormMac(formFields({ CardNo: "", ExpiredDate: "4" }), KEY);
  assert.notEqual(a, b);
});

test("the callback MAC is HMAC-SHA256 over the returned values", () => {
  const values = { OrderId: "ABC", Amount: "1000", MdStatus: "1", Currency: "TL" };
  const message =
    ALBARAKA_RESPONSE_MAC_FIELDS.map((n) => (values as Record<string, string>)[n] ?? "").join(";") +
    ";" +
    KEY;
  assert.equal(
    albarakaResponseMac(values, KEY),
    crypto.createHmac("sha256", KEY).update(message, "utf8").digest("base64")
  );
});

test("the /Sale MAC is a plain SHA256, not an HMAC, and uses no separators", () => {
  const params = {
    merchantNo: "6701717316",
    terminalNo: "67630036",
    secureTransactionId: "1010078005220492",
    cavvData: "CAVV",
    eci: "02",
    mdStatus: "1",
  };
  const concatenated =
    params.merchantNo +
    params.terminalNo +
    params.secureTransactionId +
    params.cavvData +
    params.eci +
    params.mdStatus +
    KEY;

  assert.equal(
    albarakaPaymentMac(params, KEY),
    crypto.createHash("sha256").update(concatenated, "utf8").digest("base64")
  );
  // The discriminating assertion: "fixing" this to match the other two MACs by
  // switching to HMAC would go unnoticed until the bank declined every capture.
  assert.notEqual(
    albarakaPaymentMac(params, KEY),
    crypto.createHmac("sha256", KEY).update(concatenated, "utf8").digest("base64")
  );
  assert.equal(
    ALBARAKA_PAYMENT_MAC_PARAMS,
    "MerchantNo:TerminalNo:SecureTransactionId:CavvData:Eci:MdStatus"
  );
});

test("3D order ids are exactly 20 characters", () => {
  // 3D orders are fixed at 20; cancelling one re-expands it to 24 with a "TDS_"
  // prefix, so anything else breaks reversal too.
  for (let i = 0; i < 50; i += 1) {
    const id = albarakaOrderId();
    assert.equal(id.length, 20);
    assert.match(id, /^[0-9A-F]{20}$/);
  }
  assert.notEqual(albarakaOrderId(), albarakaOrderId());
});

test("amounts travel in minor units", () => {
  assert.equal(albarakaMinorUnits(12.34), 1234);
  assert.equal(albarakaMinorUnits(0.1 + 0.2), 30);
  assert.equal(albarakaMinorUnits(0), 0);
  assert.equal(albarakaMinorUnits(-5), 0);
  assert.equal(albarakaMinorUnits(Number.NaN), 0);
});

test("only the bank's three currency codes are ever produced", () => {
  assert.equal(albarakaCurrencyCode("USD"), "US");
  assert.equal(albarakaCurrencyCode("eur"), "EU");
  assert.equal(albarakaCurrencyCode("TRY"), "TL");
  // Anything the bank doesn't accept falls back to TL rather than being passed on.
  assert.equal(albarakaCurrencyCode("GBP"), "TL");
  assert.equal(albarakaCurrencyCode(""), "TL");
});

test("both documented success codes are accepted, nothing else is", () => {
  assert.equal(isAlbarakaApproved({ ServiceResponseData: { ResponseCode: "00" } }), true);
  assert.equal(isAlbarakaApproved({ ServiceResponseData: { ResponseCode: "0000" } }), true);
  assert.equal(isAlbarakaApproved({ ServiceResponseData: { ResponseCode: "0001" } }), false);
  assert.equal(isAlbarakaApproved(null), false);
});

test("no merchant identifier is defaulted", () => {
  // A hard-coded fallback would make an unset variable sign live forms with some
  // other merchant's numbers instead of failing.
  const vars = [
    "ALBARAKA_MERCHANT_NO",
    "ALBARAKA_TERMINAL_NO",
    "ALBARAKA_POSNET_ID",
    "ALBARAKA_ENC_KEY",
  ] as const;
  const saved = vars.map((name) => [name, process.env[name]] as const);

  try {
    for (const name of vars) delete process.env[name];
    const cfg = albarakaConfig();
    assert.equal(cfg.merchantNo, "");
    assert.equal(cfg.terminalNo, "");
    assert.equal(cfg.posnetId, "");
    assert.equal(cfg.encKey, "");
    assert.equal(isAlbarakaConfigured(cfg), false);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("readiness requires every identifier, not just the key", () => {
  const complete = {
    merchantNo: "6701717316",
    terminalNo: "67630036",
    posnetId: "1010191131630431",
    encKey: KEY,
    tdsUrl: "https://example.invalid/3ds",
    serviceUrl: "https://example.invalid/svc",
    useOOS: false,
    useJokerVadaa: false,
  };
  assert.equal(isAlbarakaConfigured(complete), true);
  assert.equal(isAlbarakaConfigured({ ...complete, encKey: "" }), false);
  assert.equal(isAlbarakaConfigured({ ...complete, terminalNo: "" }), false);
  assert.equal(isAlbarakaConfigured({ ...complete, posnetId: "" }), false);
  assert.equal(isAlbarakaConfigured({ ...complete, merchantNo: "" }), false);
});
