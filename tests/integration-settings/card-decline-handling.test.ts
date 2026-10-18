import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { payForErrorMessage, payForResponseHash, verifyPayForResponseHash } from "../../lib/payfor";
import { resolvePaymentError } from "../../lib/donations/payment-error-catalog";

const PASS = "test-merchant-pass";

/* Shaped like the production 3DPay callbacks (values synthetic). */
function callback(overrides: Record<string, string> = {}): Record<string, string> {
  const body: Record<string, string> = {
    MerchantID: "9803991",
    OrderId: "6ad48ee0cd8d7cc712efe4e1",
    AuthCode: "",
    ProcReturnCode: "51",
    ResponseRnd: "PF639279227535608980",
    ErrMsg: "Limit Yetersiz",
    TxnResult: "Failed",
    ...overrides,
  };
  const raw = body.MerchantID + PASS + body.OrderId + body.AuthCode + body.ProcReturnCode + body.ResponseRnd;
  body.ResponseHash = crypto.createHash("sha1").update(raw, "utf8").digest("base64");
  return body;
}

test("PayFor ResponseHash: base64(SHA1(MerchantID+MerchantPass+OrderId+AuthCode+ProcReturnCode+ResponseRnd))", () => {
  const body = callback({ ProcReturnCode: "00", AuthCode: "123456", ErrMsg: "Approved" });
  assert.equal(payForResponseHash(body, PASS), body.ResponseHash);
  assert.equal(verifyPayForResponseHash(body, PASS), true);
});

test("a forged or altered approval does not verify", () => {
  const genuine = callback({ ProcReturnCode: "51" });
  assert.equal(verifyPayForResponseHash({ ...genuine, ProcReturnCode: "00" }, PASS), false, "decline flipped to approval");
  assert.equal(verifyPayForResponseHash({ ...genuine, OrderId: "another-order" }, PASS), false, "hash replayed on another order");
  const { ResponseHash: _omit, ...unsigned } = genuine;
  void _omit;
  assert.equal(verifyPayForResponseHash(unsigned, PASS), false, "no hash at all");
  assert.equal(verifyPayForResponseHash(genuine, undefined), false, "no merchant pass configured");
  assert.equal(verifyPayForResponseHash(genuine, "wrong-pass"), false);
});

test("the bank's decline reason is read from ErrMsg (it never sends ErrorMessage)", () => {
  assert.equal(payForErrorMessage(callback()), "Limit Yetersiz");
  assert.equal(payForErrorMessage({ ErrorMessage: "legacy" }), "legacy");
  assert.equal(payForErrorMessage({}), "");
});

test("production decline codes map to the right advice", () => {
  const key = (code: string, message?: string) =>
    resolvePaymentError({ providerProcReturnCode: code, providerErrorMessage: message }).key;
  assert.equal(key("51", "Limit Yetersiz"), "insufficientFunds");
  /* Same terminal settles other cards in USD: not "retry the same card". */
  assert.equal(key("03", "İşyeri/Terminal hatası"), "doNotHonor");
  assert.equal(resolvePaymentError({ providerProcReturnCode: "03" }).retryableSameCard, false);
  assert.equal(key("62", "Sinirli Kart"), "doNotHonor");
  /* Albaraka's 82 is "declined by policy", not a wrong CVV. */
  assert.equal(key("82", "Politika Gereği Reddedildi"), "doNotHonor");
  assert.equal(key("83", "Fraud/Güvenlik"), "fraudSuspected");
  assert.equal(key("1A", "Ek Müşteri Doğrulaması Gerekli"), "authenticationFailed");
  assert.equal(key("5C", "Transaction not supported/blocked by issuer"), "doNotHonor");
  assert.equal(key("65", "Para Cekme Limiti asildi"), "limitExceeded");
  assert.equal(key("V034", "3D User Enrollment Step Fail"), "authenticationFailed");
  assert.equal(key("V036", "System Error"), "processingError");
});

test("Turkish bank wording is understood when no code is stored", () => {
  const key = (message: string) => resolvePaymentError({ providerErrorMessage: message }).key;
  assert.equal(key("Limit Yetersiz"), "insufficientFunds");
  assert.equal(key("Para Cekme Limiti asildi"), "limitExceeded");
  assert.equal(key("Sınırlı Kart"), "doNotHonor");
  assert.equal(key("CVV2 Doğrulaması Başarısız"), "invalidCvc");
});

const read = (path: string) => readFileSync(path, "utf8");

test("the OK callback marks a donation paid only after the hash verifies", () => {
  const source = read("app/api/payfor/3dpay/ok/route.ts");
  const verify = source.indexOf("verifyPayForResponseHash(raw");
  const paid = source.indexOf(`status: "PAID",\r\n          paidAt: new Date()`) >= 0
    ? source.indexOf(`status: "PAID",\r\n          paidAt: new Date()`)
    : source.indexOf(`status: "PAID",\n          paidAt: new Date()`);
  assert.ok(verify > 0 && paid > verify, "hash check precedes the PAID write");
  assert.match(source, /payForErrorMessage\(raw\)/);
  assert.match(read("app/api/payfor/3dpay/fail/route.ts"), /payForErrorMessage\(raw\)/);
});

test("unverified approvals are not aged out as abandoned", () => {
  assert.match(read("lib/donations/reconcile-unconfirmed.ts"), /providerErrorMessage === PAYFOR_UNVERIFIED_APPROVAL/);
});

test("a card-rail retry restores the donor's basket instead of cloning an uncollectable order", () => {
  const checkout = read("components/minbar/checkout/CheckoutPage.tsx");
  const remember = checkout.indexOf("rememberCheckoutAttempt(donation.id);");
  const submit = checkout.indexOf("submitGatewayForm(form, browserFields)");
  assert.ok(remember > 0 && remember < submit, "basket kept aside before the bank redirect");
  const page = read("app/[locale]/donation-failed/page.tsx");
  const cardRail = page.indexOf("restoreCheckoutAttempt(donation.id)");
  const clone = page.indexOf("/retry`");
  assert.ok(cardRail > 0 && cardRail < clone, "card rails return before the clone request");
  assert.match(read("lib/minbar/cart.ts"), /export function restoreCheckoutAttempt/);
});
