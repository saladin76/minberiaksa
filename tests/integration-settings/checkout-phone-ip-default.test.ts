import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import vm from "node:vm";
import ts from "typescript";
import { checkoutDefaultPhoneCountry } from "../../lib/minbar/checkout-phone-country";

// Exercise the actual server geo resolver without contacting external IP APIs.
type Geo = { countryCode: string } | null;
type Resolver = {
  resolveGeoFromRequest: (request: { headers: Headers }) => Promise<Geo>;
  getClientIp: (request: { headers: Headers }) => string | null;
};
function geoFixture(env: Record<string, string> = {}) {
  const source = readFileSync("lib/geo/country-from-request.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const lookups: string[] = [];
  const exports: Record<string, unknown> = {};
  const mappings: Record<string, string> = {
    "8.8.8.8": "US", "1.1.1.1": "TR", "9.9.9.9": "SA",
  };
  const dependencies: Record<string, unknown> = {
    "node:net": { isIP },
    "@/lib/geo/intl-country-name": { countryNameFromIsoCode: (code: string) => code },
    "@/lib/geo/ip-lookup": {
      lookupIpGeo: async (ip: string) => {
        lookups.push(ip);
        return mappings[ip] ? { countryCode: mappings[ip], region: null, city: null } : null;
      },
    },
  };
  new vm.Script(js).runInNewContext({
    exports, process: { env }, Headers,
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected resolver dependency: ${id}`);
      return dependencies[id];
    },
  });
  return { resolver: exports as Resolver, lookups };
}

test("new donors get IP country even when the site locale is different", () => {
  for (const [ip, expected] of [["TR", "tr"], ["SA", "sa"], ["US", "us"],
    ["DE", "de"], ["FR", "fr"], ["GB", "gb"], ["AE", "ae"], ["MA", "ma"]]) {
    assert.equal(checkoutDefaultPhoneCountry({ ipCountry: ip }), expected);
    assert.equal(checkoutDefaultPhoneCountry({
      ipCountry: ip, accountCountry: "TR", existingPhone: "",
    }), expected, "empty phone must prefer current IP over a stale stored country");
  }
  assert.equal(checkoutDefaultPhoneCountry({
    ipCountry: "SA", accountCountry: "TR", existingPhone: "+905550000000",
  }), "tr", "travel must not override a saved international phone");
  assert.equal(checkoutDefaultPhoneCountry({
    ipCountry: null, accountCountry: "SA", existingPhone: "",
  }), "sa");
  assert.equal(checkoutDefaultPhoneCountry({ ipCountry: null }), "tr");
  assert.equal(checkoutDefaultPhoneCountry({
    ipCountry: "XX", accountCountry: "EU", existingPhone: "",
  }), "tr");
  assert.equal(checkoutDefaultPhoneCountry({
    ipCountry: "invalid", accountCountry: "TR", existingPhone: "",
  }), "tr");
});

test("geolocation on VPS ignores untrusted CDN headers and uses proxy real IP", async () => {
  const { resolver, lookups } = geoFixture();
  const headers = new Headers({
    "cf-ipcountry": "FR", "cf-connecting-ip": "9.9.9.9",
    "x-vercel-ip-country": "SA", "x-real-ip": "8.8.8.8",
    "x-forwarded-for": "1.1.1.1",
  });
  const geo = await resolver.resolveGeoFromRequest({ headers });
  assert.equal(geo?.countryCode, "US");
  assert.deepEqual(lookups, ["8.8.8.8"]);
  assert.equal(resolver.getClientIp({
    headers: new Headers({ "cf-connecting-ip": "9.9.9.9", "x-real-ip": "1.1.1.1" }),
  }), "1.1.1.1");
});

test("trusted Cloudflare and Vercel signals override IP lookups only when configured", async () => {
  const cf = geoFixture({ TRACKING_TRUST_CLOUDFLARE: "true" });
  const vercel = geoFixture({ VERCEL: "1" });
  const headers = new Headers({
    "cf-ipcountry": "FR", "cf-connecting-ip": "9.9.9.9",
    "x-vercel-ip-country": "SA", "x-real-ip": "8.8.8.8",
  });
  assert.equal((await cf.resolver.resolveGeoFromRequest({ headers }))?.countryCode, "FR");
  assert.equal((await vercel.resolver.resolveGeoFromRequest({ headers }))?.countryCode, "SA");
  assert.equal(cf.resolver.getClientIp({ headers }), "9.9.9.9");
  assert.deepEqual(cf.lookups, []);
  assert.deepEqual(vercel.lookups, []);
});

test("invalid/private IP and unavailable geolocation cannot invent a country", async () => {
  const { resolver, lookups } = geoFixture();
  const headers = new Headers({
    "cf-ipcountry": "SA", "x-vercel-ip-country": "SA",
    "x-real-ip": "not-an-ip", "x-forwarded-for": "127.0.0.1, 10.0.0.5",
  });
  assert.equal(await resolver.resolveGeoFromRequest({ headers }), null);
  assert.deepEqual(lookups, []);
  const rightmost = new Headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" });
  assert.equal(resolver.getClientIp({ headers: rightmost }), "8.8.8.8");
});

test("checkout server component uses its resolved IP and never locale for phone default", () => {
  const src = readFileSync("app/[locale]/checkout/page.tsx", "utf8");
  assert.match(src, /resolveGeoFromRequest\(/);
  assert.match(src, /ipCountry,\s*accountCountry:\s*account\?\.countryCode,\s*existingPhone:\s*donor\?\.phone/);
  assert.match(src, /defaultCountry=\{defaultCountry\}/);
});
