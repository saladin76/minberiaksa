import test from "node:test";
import assert from "node:assert/strict";
import { checkoutFieldIssue } from "../../lib/minbar/checkout-validation";

const valid = {
  firstName: "Test", email: "test@example.invalid", phone: "+905551234567",
  requireName: true, requireCard: false,
  cardNumber: "", cardExpiry: "", cardCvc: "",
};

test("checkout identifies the first missing donor field before creating an order", () => {
  assert.deepEqual(checkoutFieldIssue({ ...valid, firstName: " ", email: "", phone: "" }), { field: "firstName", message: "required" });
  assert.deepEqual(checkoutFieldIssue({ ...valid, email: " " }), { field: "email", message: "required" });
  assert.deepEqual(checkoutFieldIssue({ ...valid, email: "test@" }), { field: "email", message: "invalidEmail" });
  assert.deepEqual(checkoutFieldIssue({ ...valid, phone: "+90" }), { field: "phone", message: "invalidPhone" });
  assert.equal(checkoutFieldIssue(valid), null);
});

test("signed-in checkout validates required contact details too, without requiring a typed name", () => {
  assert.equal(checkoutFieldIssue({ ...valid, requireName: false, firstName: "" }), null);
  assert.deepEqual(checkoutFieldIssue({ ...valid, requireName: false, email: "invalid" }), { field: "email", message: "invalidEmail" });
  assert.deepEqual(checkoutFieldIssue({ ...valid, requireName: false, phone: "+90" }), { field: "phone", message: "invalidPhone" });
});

test("local card validation names the failed input and never includes its value", () => {
  const card = { ...valid, requireCard: true, cardNumber: "4111111111111111", cardExpiry: "12/39", cardCvc: "123" };
  assert.equal(checkoutFieldIssue(card), null);
  assert.deepEqual(checkoutFieldIssue({ ...card, cardNumber: "" }), { field: "cardNumber", message: "required" });
  assert.deepEqual(checkoutFieldIssue({ ...card, cardNumber: "1234567890123456" }), { field: "cardNumber", message: "invalidCardNumber" });
  assert.deepEqual(checkoutFieldIssue({ ...card, cardExpiry: "13/39" }), { field: "cardExpiry", message: "invalidCardExpiry" });
  assert.deepEqual(checkoutFieldIssue({ ...card, cardCvc: "12" }), { field: "cardCvc", message: "invalidCardCvc" });
});

test("hosted-card and alternative payment methods never demand local card data", () => {
  assert.equal(checkoutFieldIssue({ ...valid, cardNumber: "invalid", cardCvc: "invalid" }), null);
});
