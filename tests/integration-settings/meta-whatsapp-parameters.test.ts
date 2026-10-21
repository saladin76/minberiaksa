import assert from "node:assert/strict";
import test from "node:test";
import { buildMetaComponents } from "../../lib/communication/providers/meta-whatsapp/parameters";
import { buildStandardMetaComponents } from "../../lib/communication/meta-template-components";
import { metaParameterName } from "../../lib/communication/meta-parameter-name";

test("donation receipt buttons use donation id, never the body's first parameter", () => {
  const published = buildStandardMetaComponents({
    body: "Hello {{user.name}}, project {{donation.campaignTitle}}, reference {{donation.id}}",
    header: { type: "NONE" }, headerText: "", footerText: "",
    buttons: [
      { type: "URL", text: "Certificate", url: "https://minberiaksa.org/api/certificates/thanks/{{donation.id}}" },
      { type: "URL", text: "Receipt", url: "https://minberiaksa.org/api/receipts/{{donation.id}}" },
    ],
  });
  const donationId = "65f12abc1234567890abcdef";
  // The dispatch/retry callers also supply these legacy global numeric positions.
  const sent = buildMetaComponents({
    componentsSchema: published.components,
    values: {
      "1": "Ömer Yıldırım", "2": "Water project", "3": donationId,
      "user.name": "Ömer Yıldırım", "donation.campaignTitle": "Water project", "donation.id": donationId,
    },
    positionalNames: ["user.name", "donation.campaignTitle", "donation.id"],
    scopedNames: Object.fromEntries(published.bindings.map((b) => [`${b.scope}.${b.position}`, b.key])),
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.deepEqual(sent.components.filter((c) => c.type === "button"), [
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: donationId }] },
    { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: donationId }] },
  ]);
  assert.deepEqual(sent.components[0].parameters[0], { type: "text", text: "Ömer Yıldırım" });
});

test("missing scoped button id cannot borrow a populated body parameter", () => {
  const result = buildMetaComponents({
    componentsSchema: [{ type: "BUTTONS", buttons: [{ type: "URL", url: "https://example.com/{{1}}" }] }],
    values: { "1": "Donor name", "user.name": "Donor name", "donation.id": " " },
    positionalNames: ["user.name"],
    scopedNames: { "button.0.1": "donation.id" },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "TEMPLATE_PARAMETER_MISSING");
  assert.match(result.detail, /donation\.id/);
});

test("explicit component values win and legacy unscoped templates remain supported", () => {
  const explicit = buildMetaComponents({
    componentsSchema: [{ type: "BODY", text: "Hello {{1}}" }],
    values: { "body.1": "Explicit", "user.name": "Semantic", "1": "Legacy" },
    scopedNames: { "body.1": "user.name" },
  });
  assert.equal(explicit.ok, true);
  if (explicit.ok) assert.deepEqual(explicit.components[0].parameters[0], { type: "text", text: "Explicit" });
  const legacy = buildMetaComponents({
    componentsSchema: [{ type: "BODY", text: "Hello {{1}}" }], values: { "1": "Legacy" },
  });
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.deepEqual(legacy.components[0].parameters[0], { type: "text", text: "Legacy" });
});

test("header and body bindings beat shared flat numbering", () => {
  const result = buildMetaComponents({
    componentsSchema: [
      { type: "HEADER", format: "TEXT", text: "Hello {{1}}" },
      { type: "BODY", text: "Amount {{1}}" },
    ],
    values: { "1": "Amina", "user.name": "Amina", "donation.amount": "25" },
    scopedNames: { "header.1": "user.name", "body.1": "donation.amount" },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.components[1].parameters[0], { type: "text", text: "25" });
});

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


test("Meta standard template builder uses documented named body parameters when body is the only dynamic component", () => {
  const built = buildStandardMetaComponents({
    body: "Donation {{donation.amount}} {{donation.currency}}",
    header: { type: "NONE" },
    headerText: "",
    footerText: "Thank you",
    buttons: [{ type: "URL", text: "Open", url: "https://example.com/donate" }],
  });

  assert.equal(built.parameterFormat, "named");
  assert.deepEqual(built.components, [
    {
      type: "BODY",
      text: "Donation {{donation_amount}} {{donation_currency}}",
      example: {
        body_text_named_params: [
          { param_name: "donation_amount", example: "50" },
          { param_name: "donation_currency", example: "USD" },
        ],
      },
    },
    { type: "FOOTER", text: "Thank you" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: "https://example.com/donate" }] },
  ]);
});

test("Meta standard template builder falls back to positional when header or URL is dynamic", () => {
  const built = buildStandardMetaComponents({
    body: "Donation {{donation.amount}}",
    header: { type: "TEXT" },
    headerText: "Hello {{user.name}}",
    footerText: "",
    buttons: [{ type: "URL", text: "Open", url: "https://example.com/{{donation.id}}" }],
  });

  assert.equal(built.parameterFormat, "positional");
  assert.deepEqual(built.components, [
    {
      type: "HEADER",
      format: "TEXT",
      text: "Hello {{1}}",
      example: { header_text: ["أحمد"] },
    },
    {
      type: "BODY",
      text: "Donation {{1}}",
      example: { body_text: [["50"]] },
    },
    {
      type: "BUTTONS",
      buttons: [{ type: "URL", text: "Open", url: "https://example.com/{{1}}", example: ["65f12abc..."] }],
    },
  ]);
});

test("Meta send builder supplies parameter_name for named body templates", () => {
  const result = buildMetaComponents({
    componentsSchema: [
      { type: "BODY", text: "Donation {{donation_amount}} {{donation_currency}}" },
    ],
    values: {
      "donation.amount": "25",
      "donation.currency": "USD",
    },
    positionalNames: ["donation.amount", "donation.currency"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.components, [
    {
      type: "body",
      parameters: [
        { type: "text", text: "25", parameter_name: "donation_amount" },
        { type: "text", text: "USD", parameter_name: "donation_currency" },
      ],
    },
  ]);
});


test("Meta parameter names never exceed the provider's 20-character send limit", () => {
  const compact = metaParameterName("donation.campaignTitle");
  assert.ok(compact.length <= 20);
  assert.match(compact, /^[a-z][a-z0-9_]*$/);
  assert.equal(compact, metaParameterName("donation.campaignTitle"));
  assert.notEqual(compact, metaParameterName("donation.campaignName"));
});

test("Meta publisher uses the same compact name that the send builder can map back to semantics", () => {
  const published = buildStandardMetaComponents({
    body: "Project {{donation.campaignTitle}} amount {{donation.totalAmount}}",
    header: { type: "NONE" },
    headerText: "",
    footerText: "",
    buttons: [],
  });
  assert.equal(published.parameterFormat, "named");
  const body = published.components[0] as { text: string };
  const campaignName = metaParameterName("donation.campaignTitle");
  const totalName = metaParameterName("donation.totalAmount");
  assert.match(body.text, new RegExp(`\\{\\{${campaignName}\\}\\}`));
  assert.match(body.text, new RegExp(`\\{\\{${totalName}\\}\\}`));

  const sent = buildMetaComponents({
    componentsSchema: published.components,
    values: {
      "donation.campaignTitle": "Water for Gaza",
      "donation.totalAmount": "25",
    },
    positionalNames: ["donation.campaignTitle", "donation.totalAmount"],
  });
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.deepEqual(sent.components, [{
    type: "body",
    parameters: [
      { type: "text", text: "Water for Gaza", parameter_name: campaignName },
      { type: "text", text: "25", parameter_name: totalName },
    ],
  }]);
});

test("old approved schemas with overlong parameter names fail locally instead of calling Meta", () => {
  const result = buildMetaComponents({
    componentsSchema: [
      { type: "BODY", text: "Project {{donation_campaign_title}}" },
    ],
    values: { "donation.campaignTitle": "Water for Gaza" },
    positionalNames: ["donation.campaignTitle"],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "META_TEMPLATE_PARAMETER_NAME_INVALID");
});

