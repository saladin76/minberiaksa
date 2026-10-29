import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as sanitize from "../../lib/attribution/sanitize";

function fixture() {
  const cookies = new Map<string, string>(), storage = new Map<string, string>();
  const document = { referrer: "", get cookie() { return [...cookies].map(([key, value]) => key + "=" + value).join("; "); }, set cookie(value: string) { const [pair] = value.split(";"), at = pair.indexOf("="), key = pair.slice(0, at); if (/Max-Age=0/i.test(value)) cookies.delete(key); else cookies.set(key, pair.slice(at + 1)); } };
  const window = { location: { href: "", search: "" } }, module = { exports: {} as { captureAttributionFromUrl: () => void } };
  const source = ts.transpileModule(fs.readFileSync("lib/attribution/client-payload.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module, exports: module.exports, window, document, URLSearchParams, sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) }, require: (name: string) => name === "./sanitize" ? sanitize : name === "@/lib/tracking/click-id-storage" ? { captureStoredClickIds: () => ({}) } : undefined });
  return { visit: (url: string) => { const next = new URL(url); window.location = { href: next.href, search: next.search }; module.exports.captureAttributionFromUrl(); }, get: (key: string) => { const value = cookies.get("ala_attr_" + key); return value ? decodeURIComponent(value) : undefined; } };
}
test("a new campaign replaces stale exact identity instead of crediting the previous campaign", () => {
  const f = fixture(); f.visit("https://minberiaksa.org/ar/bagislar?utm_source=whatsapp&utm_medium=communication&utm_campaign=old&utm_id=old&campaign_id=old&language=ar");
  f.visit("https://minberiaksa.org/ar/bagislar?utm_source=email&utm_medium=email&utm_campaign=hotmeals");
  assert.equal(f.get("utm_campaign"), "hotmeals"); assert.equal(f.get("utm_source"), "email"); assert.equal(f.get("utm_id"), undefined); assert.equal(f.get("campaign_id"), undefined); assert.equal(f.get("language"), undefined);
});
test("internal navigation and bank/currency returns preserve the campaign and original landing", () => {
  const f = fixture(), landing = "https://minberiaksa.org/ar/bagislar?utm_source=email&utm_medium=email&utm_campaign=first&utm_id=first";
  f.visit(landing); for (const path of ["/ar/cart?currency=CAD", "/ar/checkout", "/ar/payment-processing"]) f.visit("https://minberiaksa.org" + path);
  assert.equal(f.get("utm_campaign"), "first"); assert.equal(f.get("utm_id"), "first"); assert.equal(f.get("first_landing_page"), landing);
});
