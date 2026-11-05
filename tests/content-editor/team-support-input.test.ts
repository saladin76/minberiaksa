import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { decimalAmount } from "../../lib/minbar/numeric-input";

test("cart edits and local upsells wait for rates instead of reinterpreting local money as USD", () => {
  const ast = ts.createSourceFile("cart.tsx", fs.readFileSync("components/minbar/cart/CartPage.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = new Map<string, string>();
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ["commitEdit", "addSuggestion", "addProjectSuggestion"].includes(node.name.getText(ast))) handlers.set(node.name.getText(ast), node.initializer.getText(ast));
    ts.forEachChild(node, walk);
  };
  walk(ast);
  const rows: unknown[] = [];
  for (const [name, text] of handlers) {
    const loaded = { exports: undefined as unknown as (...args: unknown[]) => void };
    vm.runInNewContext(ts.transpileModule("module.exports = " + text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { module: loaded, supportReady: false, fromLocal: () => assert.fail("must not price without rates"), replace: () => assert.fail("must not mutate basket"), Number });
    if (name === "commitEdit") loaded.exports(0);
    else if (name === "addSuggestion") loaded.exports("test", "test", 500, true);
    else loaded.exports({ id: "test", slug: "test" }, 500, true);
  }
  assert.equal(handlers.size, 3);
  const loaded = { exports: undefined as unknown as (...args: unknown[]) => void };
  vm.runInNewContext(ts.transpileModule("module.exports = " + handlers.get("addProjectSuggestion"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: loaded, supportReady: true, fromLocal: (amount: number) => ({ usd: amount / 50, local: { amount, currency: "TRY" } }), tooSmall: () => false, setUpsellMinHint: () => {}, items: [], replace: (value: unknown) => rows.push(value), announceAdded: () => {} });
  loaded.exports({ id: "test", slug: "test" }, 500, true);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [[{ projectId: "test", typeKey: "project", freqKey: "once", amount: 10, currency: "USD", local: { amount: 500, currency: "TRY" }, upsellId: "test" }]]);
});

test("the actual support input converts 500 TRY once and retains its currency for checkout", () => {
  const ast = ts.createSourceFile("cart.tsx", fs.readFileSync("components/minbar/cart/CartPage.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let change: ts.Expression | undefined;
  const walk = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "input") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const value = attrs.find(a => a.name.getText(ast) === "value");
      if (value?.initializer?.getText(ast) === "{customTeam}") {
        const onChange = attrs.find(a => a.name.getText(ast) === "onChange");
        if (onChange?.initializer && ts.isJsxExpression(onChange.initializer)) change = onChange.initializer.expression;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  if (!change) throw new Error("Missing custom support input");
  const writes: unknown[] = [], state: unknown[] = [];
  const loaded = { exports: undefined as unknown as (event: { target: { value: string } }) => void };
  const run = (ready: boolean) => {
    const source = ts.transpileModule("module.exports = " + change!.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { module: loaded, decimalAmount, Number, supportReady: ready,
      fromLocal: (n: number) => ({ usd: n / 50, local: { amount: n, currency: "TRY" } }),
      writeTeamSupport: (usd: number, local: unknown) => writes.push({ usd, local }),
      setCustomTeam: () => {}, setTeamLocal: () => {}, setTeamSupport: (n: unknown) => state.push(n), clearTeamSupport: () => {} });
    loaded.exports({ target: { value: "500" } });
  };
  run(true);
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ usd: 10, local: { amount: 500, currency: "TRY" } }]);
  assert.deepEqual(state, [10]);
  run(false);
  assert.equal(writes.length, 1, "missing rates cannot reinterpret TRY as USD");
});
