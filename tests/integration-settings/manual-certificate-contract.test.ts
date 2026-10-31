import assert from "node:assert/strict";
import test from "node:test";
import { manualCertificateInput, manualCertificatePreviewInput } from "../../lib/certificates/manual-input";
import { MANUAL_DOCUMENT_TEXT, manualDocumentTemplate } from "../../lib/certificates/manual-copy";
import { SUPPORTED_LOCALES } from "../../lib/locales";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { checkoutFieldIssue } from "../../lib/minbar/checkout-validation";
import { bankRequestsAuthentication } from "../../lib/donations/authentication-recovery";
import { resolvePaymentError } from "../../lib/donations/payment-error-catalog";

const input = { kind: "THANKS", locale: "tr", donorName: "Sample Donor", email: "recipient@example.test", phone: "00905321234567", issueDate: "2026-10-29" };
test("manual certificate validation normalizes international recipients and preserves selected language", () => {
  const parsed = manualCertificateInput.parse(input);
  assert.equal(parsed.locale, "tr"); assert.equal(parsed.phone, "+905321234567"); assert.equal(parsed.email, "recipient@example.test");
  for (const change of [{ donorName: "" }, { locale: "invalid" }, { email: "invalid" }, { phone: "05321234567" }, { issueDate: "2026-02-30" }, { currency: "<script>" }, { kind: "SHARE", amount: -1 }, { kind: "METER", amount: 20, count: 0 }]) assert.equal(manualCertificateInput.safeParse({ ...input, ...change }).success, false);
});
test("a manual financial receipt requires a positive amount, stated purpose and explicit funds-received attestation", () => {
  const valid = { ...input, kind: "RECEIPT", amount: 20, projectTitle: "Winter relief", received: true };
  assert.equal(manualCertificateInput.safeParse(valid).success, true);
  for (const change of [{ amount: 0 }, { received: false }, { projectTitle: "" }]) assert.equal(manualCertificateInput.safeParse({ ...valid, ...change }).success, false);
});
test("an unissued receipt can be previewed before funds confirmation, while issuance and invalid receipt data remain rejected", () => {
  const draft = { ...input, kind: "RECEIPT", amount: 1, currency: "TRY", projectTitle: "Preview only", received: false };
  assert.equal(manualCertificatePreviewInput.safeParse(draft).success, true);
  assert.equal(manualCertificateInput.safeParse(draft).success, false);
  assert.equal(manualCertificateInput.safeParse({ ...draft, received: true }).success, true);
  for (const change of [{ amount: 0 }, { projectTitle: "" }]) assert.equal(manualCertificatePreviewInput.safeParse({ ...draft, ...change }).success, false);
});
for (const locale of SUPPORTED_LOCALES) test(`${locale}: manual-document WhatsApp copy accepts the actual provider schema and exact same five fields`, () => {
  const body = manualDocumentTemplate(locale);
  assert.ok(body.length <= 1024); assert.ok(body.includes(MANUAL_DOCUMENT_TEXT[locale][0]) && body.includes(MANUAL_DOCUMENT_TEXT[locale][2]));
  const canonical = buildStandardMetaComponents({ body: manualDocumentTemplate("ar"), header: { type: "NONE" }, headerText: "", footerText: "", buttons: [] });
  const translated = buildStandardMetaComponents({ body, header: { type: "NONE" }, headerText: "", footerText: "", buttons: [] });
  const scopedNames = Object.fromEntries(canonical.bindings.map(row => [`${row.scope}.${row.position}`, row.key]));
  const values = { "document.title": "Document", "document.recipientName": "Recipient", "document.serial": "MIA-MAN-2026-000001", "document.date": "2026-10-29", "document.url": "https://minberiaksa.org/api/certificates/issued/111111111111111111111111?token=fixture" };
  assert.equal(canonical.bindings.length, 5);
  assert.equal(buildMetaComponents({ componentsSchema: translated.components, values, positionalNames: canonical.bindings.map(row => row.key), scopedNames }).ok, true);
});
test("a saved card needs a fresh security code but no plaintext PAN/expiry in the new checkout", () => {
  const details = { firstName: "Donor", email: "donor@example.test", phone: "+905551112233", requireName: true, requireCard: true, savedCard: true, cardNumber: "", cardExpiry: "", cardCvc: "123" };
  assert.equal(checkoutFieldIssue(details), null);
  assert.equal(checkoutFieldIssue({ ...details, cardCvc: "1234" }), null);
  for (const cvc of ["", "12", "abc", "12345"]) assert.equal(checkoutFieldIssue({ ...details, cardCvc: cvc })?.field, "cardCvc");
  assert.equal(checkoutFieldIssue({ ...details, savedCard: false })?.field, "cardNumber");
});
test("authentication-attempt is explained as verification rather than an unknown decline; actual issuer declines retain precedence", () => {
  assert.equal(bankRequestsAuthentication("888", "AUTHENTICATION_ATTEMPT"), true);
  assert.equal(bankRequestsAuthentication("1A", ""), true);
  assert.equal(bankRequestsAuthentication("51", "Insufficient funds"), false);
  assert.equal(resolvePaymentError({ providerErrorMessage: "AUTHENTICATION_ATTEMPT" }).key, "authenticationFailed");
  assert.equal(resolvePaymentError({ providerProcReturnCode: "51", providerErrorMessage: "AUTHENTICATION_ATTEMPT" }).key, "insufficientFunds");
});
