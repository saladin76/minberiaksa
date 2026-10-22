import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTemplateKind } from "../../lib/communication/template-kind";

test("legacy templates bound to automatic events leave the marketing list", () => {
  assert.equal(resolveTemplateKind({ kind: null, purpose: null }, true), "SYSTEM");
  assert.equal(resolveTemplateKind({ kind: "CAMPAIGN", purpose: "MARKETING" }, true), "SYSTEM");
});

test("unbound marketing templates remain campaign templates", () => {
  assert.equal(resolveTemplateKind({ kind: null, purpose: null }), "CAMPAIGN");
  assert.equal(resolveTemplateKind({ kind: "CAMPAIGN", purpose: "MARKETING" }), "CAMPAIGN");
});

test("system and service templates stay separate without event bindings", () => {
  assert.equal(resolveTemplateKind({ kind: "SYSTEM", purpose: "MARKETING" }), "SYSTEM");
  for (const purpose of ["UTILITY", "TRANSACTIONAL", "AUTHENTICATION"]) {
    assert.equal(resolveTemplateKind({ purpose }), "SYSTEM");
    assert.equal(resolveTemplateKind({ category: purpose }), "SYSTEM");
  }
});

test("classification does not alter Meta's marketing category", () => {
  const template = { kind: "CAMPAIGN", category: "MARKETING" };
  assert.equal(resolveTemplateKind(template, true), "SYSTEM");
  assert.equal(template.category, "MARKETING");
  assert.equal(template.kind, "CAMPAIGN");
});
