import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { paymentRetryRoute } from "../../lib/donations/payment-error-catalog";

test("retry here first; the hosted alternative only when the issuing bank itself refuses", () => {
  const route = (code: string, message = "") => paymentRetryRoute({ providerProcReturnCode: code, providerErrorMessage: message });
  assert.equal(route("51"), "otherCard", "insufficient funds: another card or a smaller amount, here");
  assert.equal(route("61"), "otherCard", "limit: here");
  assert.equal(route("96"), "sameCard", "system error: same card, here");
  assert.equal(route("", "PAYMENT_CONFIRMATION_TIMED_OUT — Bank confirmation timeout"), "sameCard", "timeout: same card, here");
  for (const code of ["59", "34", "9G", "5C", "57", "62", "41", "43"]) assert.equal(route(code), "alternate", `root cause ${code}`);
});

test("the basket is held, not emptied, while a card payment is with the bank", () => {
  const checkout = fs.readFileSync("components/minbar/checkout/CheckoutPage.tsx", "utf8");
  assert.doesNotMatch(checkout, /navigatePaymentResult\([^)]*,\s*clearCart\s*,/);
  assert.match(checkout, /navigatePaymentResult\(form\.actionUrl, \(\) => holdCartForPayment\(donation\.id, donation\.accessToken\)/);
  assert.match(fs.readFileSync("components/minbar/checkout/PaymentResultWatcher.tsx", "utf8"), /payload\?\.state === "paid" \? \(\) => \{ clearCart\(\); clearPendingPayment\(\); \} : \(\) => \{\}/);
  const check = fs.readFileSync("components/minbar/checkout/CartPendingCheck.tsx", "utf8");
  assert.match(check, /if \(details\.paidAt\) \{ clearCart\(\); clearPendingPayment\(\); return; \}/);
  assert.match(fs.readFileSync("app/[locale]/layout.tsx", "utf8"), /<CartPendingCheck \/>/);
});

test("the failure page leads with a retry here unless the cause is a root cause", () => {
  const page = fs.readFileSync("app/[locale]/donation-failed/page.tsx", "utf8");
  assert.match(page, /\{route === "alternate" \? alternateSection : null\}/);
  assert.match(page, /href=\{route === "alternate" \? "#donate-again" : "#retry-here"\}/);
  assert.match(page, /<details className="rounded-2xl border border-gray-200 bg-white">/);
});

test("the failure page and the catalog use the same root causes", () => {
  const page = fs.readFileSync("app/[locale]/donation-failed/page.tsx", "utf8");
  const catalog = fs.readFileSync("lib/donations/payment-error-catalog.ts", "utf8");
  const list = (src: string, name: string) => JSON.stringify((src.match(new RegExp(name + "[^\\[]*\\[([^\\]]*)\\]")) ?? [])[1]?.replace(/\s/g, ""));
  assert.equal(list(page, "ROOT_CAUSE_KEYS"), list(catalog, "ROOT_CAUSE_KEYS"));
  assert.equal(list(page, "ROOT_CAUSE_CODES"), list(catalog, "ROOT_CAUSE_CODES"));
});
