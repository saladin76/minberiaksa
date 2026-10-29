import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
type Element = { type: unknown; props: Record<string, unknown> };
function children(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(children);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...children(node.props.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : typeof value === "string" ? value : "";
}
function harness() {
  const hooks: unknown[] = [], cart: unknown[] = [], navigation: string[] = [], focus: string[] = [];
  let cursor = 0;
  const dependencies: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (next: unknown) => { hooks[i] = typeof next === "function" ? next(hooks[i]) : next; }]; },
      useRef: () => { const i = cursor++; return hooks[i] ??= { current: null }; }, useId: () => "waqf-name-errors",
    },
    "react/jsx-runtime": { jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }), Fragment: "fragment" },
    "next/navigation": { useRouter: () => ({ push: (url: string) => navigation.push(url) }) },
    "next-intl": { useLocale: () => "ar", useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}` },
    "@/components/minbar/ds": { Button: "button" }, "@/lib/minbar/routes": { miaPath: (page: string) => `/ar/${page}` },
    "@/lib/minbar/cart": { addToCart: (item: unknown) => cart.push(item) },
    "@/lib/minbar/waqf": { WAQF_MAX_COUNT: 100, WAQF_UNIT_PRICE_USD: { share: 100, meter: 1500 } },
    "@/hooks/useMinbarMoney": { useMinbarMoney: () => ({ format: String, formatNumber: String }) },
    "@/components/minbar/banners/ZakatBanner": {}, "@/components/minbar/banners/TravelBanner": {}, "@/components/minbar/banners/IbadanBanner": {}, "./WaqfCertificatePreview": {},
  };
  const loaded = { exports: {} as { default: (props: Record<string, unknown>) => Element } };
  const source = ts.transpileModule(readFileSync("components/minbar/waqf/WaqfPage.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, window: { setTimeout() {} },
    require: (id: string) => { assert.ok(id in dependencies, id); return dependencies[id]; } });
  let nodes: Element[] = [];
  function render() {
    cursor = 0; nodes = children(loaded.exports.default({}));
    for (const [i, input] of nodes.filter(node => node.type === "input").entries()) (input.props.ref as { current: unknown }).current = { focus: () => focus.push(i === 0 ? "name" : "onBehalf") };
  }
  const click = (label: string) => { const button = nodes.find(node => node.type === "button" && text(node).includes(label)); assert.ok(button, label); (button.props.onClick as () => void)(); render(); };
  const fill = (index: number, value: string) => { const input = nodes.filter(node => node.type === "input")[index]; (input.props.onChange as (event: unknown) => void)({ target: { value } }); render(); };
  render();
  return { click, fill, nodes: () => nodes, focus, cart, navigation };
}
test("a missing waqf certificate name focuses the right field and clicking the explicit error focuses it again", () => {
  const h = harness(); h.click("common.donateNow");
  assert.deepEqual(h.focus, ["name"]); assert.equal(h.cart.length, 0); assert.equal(h.navigation.length, 0);
  const alert = h.nodes().find(node => node.props.role === "alert"); assert.ok(alert); assert.ok(text(alert).includes("waqf.certName"));
  h.click("validation.required"); assert.equal(h.focus.at(-1), "name");
  h.fill(0, "Fixture Endower"); h.click("common.donateNow"); assert.equal(h.focus.at(-1), "onBehalf");
  h.fill(1, "Fixture Dedication"); assert.equal(h.nodes().some(node => node.props.role === "alert"), false);
  h.click("common.donateNow"); assert.equal(h.cart.length, 1); assert.deepEqual(h.navigation, ["/ar/cart"]);
});
test("the waqf self suggestion works before a donor name exists, without inventing a donor name or bypassing validation", () => {
  const h = harness(); h.click("waqf.suggestSelf");
  assert.equal(h.nodes().filter(node => node.type === "input")[1].props.value, "waqf.selfAndLoved");
  assert.equal(h.nodes().filter(node => node.type === "input")[0].props.value, ""); assert.equal(h.focus.at(-1), "name");
  h.click("common.donateNow"); assert.equal(h.cart.length, 0);
  h.fill(0, "Fixture Endower"); h.click("common.donateNow"); assert.equal(h.cart.length, 1);
});
