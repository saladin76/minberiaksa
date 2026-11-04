import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

// Read the actual page's prop wiring, then render the real sidebar component.
function sidebarProps(user: Record<string, number>) {
  const source = ts.createSourceFile("profile.tsx", fs.readFileSync("app/[locale]/profile/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.JsxSelfClosingElement | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "ImpactCompact") found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, "profile sidebar must render ImpactCompact");
  const props: Record<string, number> = {};
  for (const attribute of found.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !attribute.initializer || !ts.isJsxExpression(attribute.initializer)) continue;
    const expression = attribute.initializer.expression;
    if (expression && ts.isPropertyAccessExpression(expression) && expression.expression.getText(source) === "user") {
      props[attribute.name.getText(source)] = user[expression.name.text];
    }
  }
  return props;
}
function compact() {
  const fixture = { exports: {} as { ImpactCompact: (props: Record<string, number>) => React.ReactElement } };
  const source = fs.readFileSync("app/[locale]/profile/_components/ImpactCard.tsx", "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module: fixture, exports: fixture.exports,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next-intl") return { useTranslations: () => (key: string, values?: { count?: number }) => key + ":" + (values?.count ?? "") };
      if (name === "@/context/CurrencyContext") return { useCurrency: () => ({ convertToCurrency: () => null }) };
      if (name === "@/components/ui/card") return { Card: ({ children }: { children: React.ReactNode }) => createElement("div", null, children) };
      if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("i") });
      throw new Error("Unexpected import " + name);
    },
  });
  return fixture.exports.ImpactCompact;
}
test("profile sidebar renders the account's real active subscription count", () => {
  const Component = compact();
  for (const count of [0, 1, 3]) {
    const props = sidebarProps({ activeSubscriptionsCount: count, totalDonationsCount: 4, streakMonths: 2 });
    assert.equal(props.activeSubscriptionsCount, count);
    const html = renderToStaticMarkup(createElement(Component, props));
    assert.ok(html.includes("acrossSubs:" + count));
    assert.ok(html.includes("acrossDonations:4"));
  }
});
