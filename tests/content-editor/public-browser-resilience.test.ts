import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { imageUrl, imageSrcSet } from "../../lib/minbar/image-url";
import { projectImageAttempts } from "../../lib/minbar/project-image-fallback";

function expression(path: string, name: string): string {
  const ast = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result = "";
  const walk = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast);
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) result = node.initializer.getText(ast);
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(result, name);
  return result;
}

test("actual pixel click capture preserves URL IDs when storage getters/read/write are denied", () => {
  const source = ts.transpileModule("module.exports = " + expression("components/TrackingPixels.tsx", "captureClickIds"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const mode of ["getter", "read", "write", "normal"]) {
    const data = new Map([["_gclid", "cached-google"], ["_ttclid", "cached-tiktok"]]);
    const loaded = { exports: undefined as unknown as () => Record<string, string> };
    const sandbox = { module: loaded, window: {}, getUrlParam: (key: string) => ({ ttclid: "url-tiktok", fbclid: "url-meta" } as Record<string, string>)[key] };
    Object.defineProperty(sandbox, "sessionStorage", { get: () => {
      if (mode === "getter") throw new Error("SecurityError");
      return { getItem: (key: string) => { if (mode === "read") throw new Error("SecurityError"); return data.get(key); },
        setItem: (key: string, value: string) => { if (mode === "write") throw new Error("QuotaExceededError"); data.set(key, value); } };
    } });
    vm.runInNewContext(source, sandbox);
    const ids = loaded.exports();
    assert.equal(ids.ttclid, "url-tiktok");
    assert.equal(ids.fbclid, "url-meta");
    assert.equal(ids.gclid, mode === "getter" || mode === "read" ? undefined : "cached-google");
  }
});

test("actual currency hook has a matching first render and uses fetched rates with blocked browser cache", async () => {
  const values: unknown[] = [], effects: Array<() => unknown> = [];
  let cursor = 0;
  const loaded = { exports: {} as { default: () => { getSelectedCurrency: () => string; convertToCurrency: (n: number) => { convertedValue: number | null }; loading: boolean } } };
  const react = {
    useState: (initial: unknown) => {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (next: unknown) => { values[slot] = typeof next === "function" ? (next as (prev: unknown) => unknown)(values[slot]) : next; }];
    }, useEffect: (effect: () => unknown) => { effects.push(effect); },
  };
  const errors: unknown[] = [];
  const source = ts.transpileModule(fs.readFileSync("hooks/useCurrencyConverter.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const imports: Record<string, unknown> = {
    react, "js-cookie": { get: () => "TRY" }, "@/lib/dashboard/currency": { currencyCookieName: () => "currency", onDashboard: () => false },
    "@/components/CurrencyFromUrlSync": { CURRENCY_COOKIE_UPDATED_EVENT: "currency-updated" },
  };
  const sandbox = { module: loaded, exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name]; },
    document: { cookie: "currency=TRY" }, window: { location: { pathname: "/tr/bagislar/test" }, addEventListener: () => {}, removeEventListener: () => {} },
    fetch: async () => ({ json: async () => ({ result: "success", rates: { TRY: 50, USD: 1 } }) }),
    console: { error: (...args: unknown[]) => errors.push(args) }, Date, JSON,
  };
  Object.defineProperty(sandbox, "localStorage", { get: () => { throw new Error("SecurityError"); } });
  vm.runInNewContext(source, sandbox);
  const render = () => { cursor = 0; return loaded.exports.default(); };
  const first = render();
  assert.equal(first.getSelectedCurrency(), "DEFAULT", "cookie must not change the first client markup before hydration");
  assert.equal(first.convertToCurrency(10).convertedValue, 10);
  effects.splice(0).forEach(run => run());
  await new Promise(resolve => setImmediate(resolve));
  const hydrated = render();
  assert.equal(hydrated.getSelectedCurrency(), "TRY");
  assert.equal(hydrated.convertToCurrency(10).convertedValue, 500);
  assert.equal(hydrated.loading, false);
  assert.deepEqual(errors, [], "blocked optional cache must not be reported as a failed rates fetch");
});

test("actual project actions cannot create a basket before local pricing is available", () => {
  for (const name of ["onDonate", "onAddToBasket"]) {
    const loaded = { exports: undefined as unknown as () => void };
    const source = ts.transpileModule("module.exports = " + expression("components/minbar/projects/DonationPanel.tsx", name), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, { module: loaded, pricingReady: false, addToCart: () => assert.fail("unpriced donation") });
    assert.doesNotThrow(() => loaded.exports());
  }
});

test("project confirmation keeps the exact local cents rather than rounding the donation", () => {
  const loaded = { exports: "" };
  const source = ts.transpileModule("module.exports = " + expression("components/minbar/projects/DonationPanel.tsx", "displayAmount"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { module: loaded, given: { usd: 50.011, local: { amount: 2500.55, currency: "TRY" } }, amount: 50.011, code: "TRY",
    formatLocal: (value: number, options: { maximumFractionDigits: number }) => value.toFixed(options.maximumFractionDigits), format: () => assert.fail("must retain local amount") });
  assert.equal(loaded.exports, "2500.55");
});

test("checkout does not show the server's empty basket as a zero payable total", () => {
  const source = ts.transpileModule("module.exports = " + expression("components/minbar/checkout/CheckoutPage.tsx", "pricingReady"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const [hydrated, currency, inLocal, expected] of [[false, "USD", false, false], [true, "USD", false, true], [true, "TRY", false, false], [true, "TRY", true, true]] as const) {
    const loaded = { exports: undefined as unknown };
    vm.runInNewContext(source, { module: loaded, hydrated, currency, inLocal });
    assert.equal(loaded.exports, expected);
  }
});

test("incident CLI selects only candidate financial references without bank calls, writes or donor details", async () => {
  const source = ts.transpileModule(fs.readFileSync("scripts/audit-team-support-incident.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const days of ["4", "0"]) {
    const calls: Record<string, unknown>[] = [], output: string[] = [];
    let disconnected = false;
    const imports: Record<string, unknown> = { "@next/env": { loadEnvConfig: () => {} }, "@prisma/client": { PrismaClient: class {
      donation = { findMany: async (query: Record<string, unknown>) => { calls.push(query); return []; } };
      $disconnect = async () => { disconnected = true; };
    } } };
    const loaded = { exports: {} };
    vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, "unexpected IO " + name); return imports[name]; },
      process: { env: { AUDIT_DAYS: days }, cwd: () => "/fixture" }, console: { log: (message: string) => output.push(message), error: () => {} }, Date, Number, Error });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(disconnected, true);
    assert.equal(calls.length, days === "4" ? 1 : 0);
    if (days === "4") {
      const result = JSON.parse(output[0]);
      assert.equal(result.providerCalls, 0);
      assert.equal(result.databaseWrites, 0);
      assert.equal(calls[0].take, 101);
      assert.deepEqual(Object.keys(calls[0].select as object).sort(), ["id", "createdAt", "paidAt", "status", "provider", "providerOrderId", "currency", "amount", "teamSupport", "totalAmount"].sort());
    }
  }
});

test("project route provides the Gift namespace used by its donation validation", () => {
  const ast = ts.createSourceFile("page.tsx", fs.readFileSync("app/[locale]/bagislar/[slug]/page.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let names: string[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "NAMESPACES" && node.initializer) {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isArrayLiteralExpression(value)) names = value.elements.filter(ts.isStringLiteral).map(x => x.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(names.includes("Gift"));
  assert.match(fs.readFileSync("components/minbar/projects/DonationPanel.tsx", "utf8"), /tGift\("validationError"\)/);
});

type RenderNode = { type?: string; props?: { children?: unknown; src?: string; srcSet?: string; sizes?: string; loading?: string; fetchPriority?: string; alt?: string } };
test("actual project media delivers responsive resized images, prioritizes the cover and reserves its frame", () => {
  const loaded = { exports: {} as { default: (props: { images: string[]; title: string; imageAlt?: string }) => RenderNode } };
  // Render the real nested image component, not a hand-written image mock:
  // otherwise changes to responsive URLs and image priorities would be missed.
  const jsx = (type: string | ((props: RenderNode["props"]) => RenderNode), props: RenderNode["props"]): RenderNode =>
    typeof type === "function" ? type(props) : { type, props };
  const imports: Record<string, unknown> = {
    react: {
      useRef: () => ({ current: null }),
      useState: (initial: unknown) => [initial, () => {}],
      useEffect: () => {},
      useCallback: (fn: unknown) => fn,
      useMemo: (factory: () => unknown) => factory(),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next-intl": { useTranslations: () => (key: string) => key },
    "@/components/minbar/home/TopSections": { ArrowGlyph: "arrow" },
    "@/lib/minbar/project-image-fallback": { projectImageAttempts },
  };
  const imageModule = { exports: {} as { default: (props: RenderNode["props"]) => RenderNode } };
  const imageSource = ts.transpileModule(fs.readFileSync("components/minbar/projects/ProjectImage.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(imageSource, {
    module: imageModule, exports: imageModule.exports,
    require: (name: string) => { assert.ok(name in imports, name); return imports[name]; },
  });
  imports["./ProjectImage"] = imageModule.exports;
  const source = ts.transpileModule(fs.readFileSync("components/minbar/projects/ProjectHeroMedia.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name]; } });
  const collect = (value: unknown): RenderNode[] => {
    if (Array.isArray(value)) return value.flatMap(collect);
    if (!value || typeof value !== "object") return [];
    const node = value as RenderNode;
    return [...(node.type === "img" ? [node] : []), ...collect(node.props?.children)];
  };
  const original = "https://res.cloudinary.com/fixture/image/upload/v1/campaign.jpg";
  for (const images of [[original], [original, original.replace("campaign", "second")]]) {
    const tree = loaded.exports.default({ images, title: "Project", imageAlt: "Reviewed alt" });
    const pictures = collect(tree);
    assert.equal(pictures.length, images.length);
    assert.equal(pictures[0].props?.loading, "eager");
    assert.equal(pictures[0].props?.fetchPriority, "high");
    assert.equal(pictures[0].props?.alt, "Reviewed alt");
    assert.match(pictures[0].props?.src || "", /f_auto,q_auto,c_limit,w_/);
    assert.match(pictures[0].props?.srcSet || "", /640w.*1920w/);
    if (images.length > 1) assert.equal(pictures[1].props?.loading, "lazy");
  }
});
