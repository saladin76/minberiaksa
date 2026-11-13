import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as sanitize from "../../lib/attribution/sanitize";
import * as ga4SessionCookie from "../../lib/attribution/ga4-session-cookie";

function fixture() {
  const cookies = new Map<string, string>(), storage = new Map<string, string>();
  const document = { referrer: "", get cookie() { return [...cookies].map(([key, value]) => key + "=" + value).join("; "); }, set cookie(value: string) { const [pair] = value.split(";"), at = pair.indexOf("="), key = pair.slice(0, at); if (/Max-Age=0/i.test(value)) cookies.delete(key); else cookies.set(key, pair.slice(at + 1)); } };
  const window = { location: { href: "", search: "" } }, loaded = { exports: {} as { captureAttributionFromUrl: () => void; getDonationAttributionPayload: () => Record<string,string> } };
  const sessionStorage = { getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key) };
  const clickIds = { exports: {} };
  const clickSource = ts.transpileModule(fs.readFileSync("lib/tracking/click-id-storage.ts", "utf8"), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  new vm.Script(clickSource).runInNewContext({module:clickIds,exports:clickIds.exports,window,URLSearchParams,sessionStorage});
  const source = ts.transpileModule(fs.readFileSync("lib/attribution/client-payload.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, window, document, URLSearchParams, sessionStorage, require: (name: string) => name === "./sanitize" ? sanitize : name === "./ga4-session-cookie" ? ga4SessionCookie : name === "@/lib/tracking/click-id-storage" ? clickIds.exports : undefined });
  return { cookie: (name: string, value: string) => cookies.set(name, value), payload: () => loaded.exports.getDonationAttributionPayload(), visit: (url: string) => { const next = new URL(url); window.location = { href: next.href, search: next.search }; loaded.exports.captureAttributionFromUrl(); }, get: (key: string) => { const value = cookies.get("ala_attr_" + key); return value ? decodeURIComponent(value) : undefined; } };
}
test("a new campaign replaces stale exact identity instead of crediting the previous campaign", () => {
  const f = fixture(); f.visit("https://minberiaksa.org/ar/bagislar?utm_source=whatsapp&utm_medium=communication&utm_campaign=old&utm_id=old&campaign_id=old&language=ar");
  f.visit("https://minberiaksa.org/ar/bagislar?utm_source=email&utm_medium=email&utm_campaign=hotmeals");
  assert.equal(f.get("utm_campaign"), "hotmeals"); assert.equal(f.get("utm_source"), "email"); assert.equal(f.get("utm_id"), undefined); assert.equal(f.get("campaign_id"), undefined); assert.equal(f.get("language"), undefined);
});
test("internal navigation and bank/currency returns preserve the campaign and original landing", () => {
  const f = fixture(), landing = "https://minberiaksa.org/ar/bagislar?utm_source=email&utm_medium=email&utm_campaign=first&utm_id=first";
  f.visit(landing); for (const path of ["/ar/cart?currency=CAD", "/ar/checkout", "/ar/payment-processing"]) f.visit("https://minberiaksa.org" + path);
  assert.equal(f.get("utm_campaign"), "first"); assert.equal(f.get("utm_id"), "first"); assert.equal(f.get("first_landing_page"), landing); assert.equal(f.get("landing_page"), landing);
});

test("a new native click without UTM does not borrow the previous campaign or ad identity",()=>{
  const f=fixture();f.visit("https://minberiaksa.org/ar?utm_source=facebook&utm_medium=paid_social&utm_campaign=old&ad_id=old-ad&adset_name=old-group&fbclid=old-click");
  f.visit("https://minberiaksa.org/ar?gclid=google-click");
  const payload=f.payload();assert.equal(payload.gclid,"google-click");assert.equal(payload.fbclid,undefined);assert.equal(payload.utm_source,undefined);assert.equal(payload.ad_id,undefined);assert.equal(payload.adset_name,undefined);
});
test("a fresh Meta click updates both fbclid and its matching fbc cookie",()=>{
  const f=fixture();f.visit("https://minberiaksa.org/ar?fbclid=old-click");f.visit("https://minberiaksa.org/ar?fbclid=new-click");
  const payload=f.payload();assert.equal(payload.fbclid,"new-click");assert.ok(payload.fbc.endsWith(".new-click"));
});
test("Snap's official mixed-case ScCid parameter is captured and retained through checkout",()=>{
  const f=fixture();f.visit("https://minberiaksa.org/ar?ScCid=snap-click");f.visit("https://minberiaksa.org/ar/checkout");assert.equal(f.payload().scclid,"snap-click");
});

test("checkout capture includes only genuine GA4 session IDs from a browser cookie", () => {
  const f = fixture();
  f.visit("https://minberiaksa.org/ar/bagislar?utm_source=google&utm_medium=cpc");
  f.cookie("_ga", "GA1.1.123456789.1763000000");
  f.cookie("_ga_ABC", "GS2.1.s1763000000$o2$g1$t1763000040$j60$l0$h0");
  assert.equal(f.payload().ga_client_id, "123456789.1763000000");
  assert.equal(f.payload().ga_session_id, "1763000000");
  f.cookie("analytics_consent", "denied");
  assert.equal(f.payload().ga_session_id, undefined);
});
