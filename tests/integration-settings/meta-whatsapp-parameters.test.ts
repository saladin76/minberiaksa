import assert from "node:assert/strict";
import test from "node:test";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";

test("Meta parameter builder maps scoped header/body variables independently", () => {
  const result = buildMetaComponents({
    componentsSchema: [
      { type: "HEADER", format: "TEXT", text: "Hello {{1}}" },
      { type: "BODY", text: "Amount {{1}} {{2}}" },
    ],
    values: {
      "user.name": "Amina",
      "donation.amount": "25",
      "donation.currency": "USD",
    },
    scopedNames: {
      "header.1": "user.name",
      "body.1": "donation.amount",
      "body.2": "donation.currency",
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.components, [
    { type: "header", parameters: [{ type: "text", text: "Amina" }] },
    { type: "body", parameters: [{ type: "text", text: "25" }, { type: "text", text: "USD" }] },
  ]);
});

test("Meta parameter builder fails safely when a dynamic URL button value is missing", () => {
  const result = buildMetaComponents({
    componentsSchema: [
      { type: "BODY", text: "Thank you" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: "https://example.com/{{1}}" }] },
    ],
    values: {},
    scopedNames: { "button.0.1": "donation.id" },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "TEMPLATE_PARAMETER_MISSING");
});

test("Meta authentication template requires OTP and sends it to body and OTP button", () => {
  const missing = buildMetaComponents({
    componentsSchema: [
      { type: "BODY", add_security_recommendation: true },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy Code" }] },
    ],
    values: {},
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "AUTHENTICATION_OTP_MISSING");

  const built = buildMetaComponents({
    componentsSchema: [
      { type: "BODY", add_security_recommendation: true },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy Code" }] },
    ],
    values: { "otp.code": "123456" },
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.deepEqual(built.components, [
    { type: "body", parameters: [{ type: "text", text: "123456" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
  ]);
});

test("Meta location header requires coordinates and builds an exact location parameter", () => {
  const missing = buildMetaComponents({
    componentsSchema: [{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "Visit us" }],
    values: {},
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "TEMPLATE_HEADER_LOCATION_MISSING");

  const built = buildMetaComponents({
    componentsSchema: [{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "Visit us" }],
    values: {},
    headerLocation: { latitude: 41.0082, longitude: 28.9784, name: "Office", address: "Istanbul" },
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.deepEqual(built.components[0], {
    type: "header",
    parameters: [{
      type: "location",
      location: { latitude: 41.0082, longitude: 28.9784, name: "Office", address: "Istanbul" },
    }],
  });
});
