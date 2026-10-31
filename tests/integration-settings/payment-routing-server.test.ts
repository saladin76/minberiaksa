import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { isIP } from "node:net";
import { decideNewCardRoute } from "../../lib/donations/payment-routing";
import { parseMainGateway } from "../../lib/payment-gateway";
// Isolated policy boundary: no database, external geolocation, bank or recipient is contacted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = Record<string, any>;
function load(file: string, deps: Dict, env: Dict = {}) {
 const loaded = { exports: {} as Dict };
 new vm.Script(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({ module: loaded, exports: loaded.exports, process: { env }, Date, Promise, setTimeout, clearTimeout, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } }); return loaded.exports;
}
test("country lookup only accepts trusted country headers or a validated public proxy address", async () => {
 const seen: string[] = [], fixture = (env: Dict = {}) => load("lib/donations/payment-routing-country.ts", { "server-only": {}, "node:net": { isIP }, "../geo/ip-lookup": { lookupIpGeo: async (ip: string) => { seen.push(ip); return { countryCode: "TR" }; } } }, env);
 const regular = fixture(); for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.1", "100.64.0.1", "::1", "fc00::1", "::ffff:127.0.0.1", "invalid"]) assert.equal(regular.publicRoutingIp(ip), null);
 assert.equal(await regular.paymentRoutingCountry(new Headers({ "cf-ipcountry": "SA", "x-vercel-ip-country": "SA" })), null); assert.equal(seen.length, 0);
 assert.equal(await regular.paymentRoutingCountry(new Headers({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "1.1.1.1", "cf-ipcountry": "SA" })), "TR"); assert.deepEqual(seen, ["8.8.8.8"]);
 assert.equal(await fixture({ TRACKING_TRUST_CLOUDFLARE: "true" }).paymentRoutingCountry(new Headers({ "cf-ipcountry": "SA" })), "SA");
 assert.equal(await fixture({ VERCEL: "1" }).paymentRoutingCountry(new Headers({ "x-vercel-ip-country": "SA" })), "SA");
});
test("shared server resolver excludes PayPal, transfers and recurring orders before any configuration or geolocation read", async () => {
 let reads = 0; const route = load("lib/donations/payment-routing-server.ts", { "server-only": {}, "../prisma": { prisma: { globalSettings: { findFirst: () => { reads++; throw new Error("must not read"); } } } }, "../payment-gateway": { parseMainGateway }, "./payment-routing": { decideNewCardRoute }, "./payment-routing-country": { paymentRoutingCountry: () => { reads++; throw new Error("must not look up"); } } });
 for (const [method,type] of [["PAYPAL","ONE_TIME"],["BANK_TRANSFER","ONE_TIME"],["CARD","DAILY"],["CARD","FRIDAY"],["CARD","MONTHLY"]]) assert.equal(await route.resolveNewCardPaymentRoute(new Headers(), { method, type, currency:"TRY" }), null);
 assert.equal(reads, 0);
});
test("the server uses the signed-in donor phone only when no checkout phone is supplied, without accepting account country", async () => {
 let phoneReads = 0, geoReads = 0;const settings = { mainGateway: "ALBARAKA", payforEnabled: true, payforSaudiRoutingEnabled: true };
 const route = load("lib/donations/payment-routing-server.ts", { "server-only": {}, "../prisma": { prisma: { globalSettings: { findFirst: async () => settings }, user: { findUnique: async () => { phoneReads++;return { phone: "+966501234567", countryCode: "TR" }; } } } }, "../payment-gateway": { parseMainGateway }, "./payment-routing": { decideNewCardRoute }, "./payment-routing-country": { paymentRoutingCountry: async () => { geoReads++;return null; } } });
 assert.equal((await route.resolveNewCardPaymentRoute(new Headers(), { method:"CARD", type:"ONE_TIME", currency:"USD", userId:"fixture" })).reason, "SA_PHONE"); assert.equal(phoneReads, 1);
 assert.equal((await route.resolveNewCardPaymentRoute(new Headers(), { method:"CARD", type:"ONE_TIME", currency:"USD", userId:"fixture",phone:"+905551234567" })).gateway, "ALBARAKA"); assert.equal(phoneReads, 1);
 settings.payforSaudiRoutingEnabled = false;await route.resolveNewCardPaymentRoute(new Headers(), { method:"CARD", type:"ONE_TIME", currency:"USD", userId:"fixture" });assert.equal(geoReads, 2);assert.equal(phoneReads, 1);
});
