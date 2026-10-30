import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { checkoutFieldIssue } from "../../lib/minbar/checkout-validation";

// Exercise the real handler and button expression; no payment adapter or database is loaded.
const source = fs.readFileSync("components/minbar/checkout/CheckoutPage.tsx", "utf8");
const ast = ts.createSourceFile("CheckoutPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: ts.ArrowFunction | undefined;
let disabled: ts.Expression | undefined;
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "onSubmit" && node.initializer && ts.isArrowFunction(node.initializer)) handler = node.initializer;
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "button") {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    if (attributes.some(attribute => attribute.name.getText(ast) === "className" && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "mia-card-cta")) {
      const attribute = attributes.find(attribute => attribute.name.getText(ast) === "disabled");
      if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) disabled = attribute.initializer.expression;
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler); assert.ok(disabled);
function handlerHarness(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const context = {
    submitting: false, items: [{}], requiresVerificationChoice: true, verificationMode: null,
    belowMinimum: false, session: null, firstName: "Fixture", email: "fixture@example.invalid", phone: "+905551234567", method: "card", needsOwnCardForm: false, gateway: "ALBARAKA",
    cardNumber: "", cardExpiry: "", cardCvc: "", selectedCardId: null, checkoutFieldIssue,
    t: (key: string) => key, tValidation: (key: string) => key,
    setError: (value: string) => events.push(`error:${value}`), setInvalidField: () => {},
    setSubmitting: () => { throw new Error("payment creation must not start"); },
    document: { getElementById: (id: string) => ({ focus: () => events.push(`focus:${id}`), scrollIntoView: () => events.push(`scroll:${id}`) }) },
    ...overrides,
  };
  const code = ts.transpileModule(`module.exports = ${handler!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: undefined as unknown as (event: { preventDefault: () => void }) => Promise<void> };
  new vm.Script(code).runInNewContext({ ...context, module: loaded });
  return { events, submit: () => loaded.exports({ preventDefault() {} }) };
}

test("a donor can request validation before selecting 2D or 3D; operational blocks still disable submission", () => {
  const expression = disabled!.getText(ast);
  const valid = { submitting: false, items: [{}], belowMinimum: false, method: "card", cardRailUnavailable: false, requiresVerificationChoice: true, verificationMode: null };
  assert.equal(vm.runInNewContext(expression, valid), false);
  for (const blocked of [{ submitting: true }, { items: [] }, { belowMinimum: true }, { cardRailUnavailable: true }]) assert.equal(vm.runInNewContext(expression, { ...valid, ...blocked }), true);
});

test("missing verification choice displays a localized message and focuses it before any payment work", async () => {
  const h = handlerHarness(); await h.submit();
  assert.deepEqual(h.events, ["error:verificationRequired", "focus:albaraka-2d", "scroll:albaraka-2d"]);
});

test("selecting either mode continues to donor-field validation instead of inventing a charge", async () => {
  for (const verificationMode of ["2D", "3D"]) {
    const h = handlerHarness({ verificationMode, firstName: "" }); await h.submit();
    assert.equal(h.events[0], "error:firstName: required"); assert.equal(h.events[1], "focus:checkout-firstName");
  }
});
test("an untouched form reports the first missing donor field before the later verification choice", async () => {
  const h = handlerHarness({ firstName: "" }); await h.submit();
  assert.equal(h.events[0], "error:firstName: required");
});
