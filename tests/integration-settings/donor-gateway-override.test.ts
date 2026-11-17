import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { decideNewCardRoute, type CountryGatewayRule } from "../../lib/donations/payment-routing";
import { parseMainGateway } from "../../lib/payment-gateway";

const NOW = new Date("2026-11-17T09:00:00Z");
const base = { mainGateway: parseMainGateway("ALBARAKA"), payforEnabled: true, saudiEnabled: false, currency: "USD", now: NOW };
const SA: CountryGatewayRule = { country: "SA", gateway: "PAYFOR", matchBy: "ANY" };
const AE_PHONE: CountryGatewayRule = { country: "AE", gateway: "PAYFOR", matchBy: "PHONE" };

test("a pinned donor goes to the chosen gateway, ahead of any country rule", () => {
  assert.deepEqual([decideNewCardRoute({ ...base, donorOverride: "PAYFOR" })].map((r) => [r.gateway, r.reason]), [["PAYFOR", "DONOR_OVERRIDE"]]);
  const r = decideNewCardRoute({ ...base, phone: "+966501234567", countryRules: [SA], donorOverride: "ALBARAKA" });
  assert.equal(r.gateway, "ALBARAKA"); assert.equal(r.reason, "DONOR_OVERRIDE");
});

test("a country rule matches by phone, by IP or either, as configured", () => {
  const byPhone = decideNewCardRoute({ ...base, phone: "+971501234567", countryRules: [AE_PHONE] });
  assert.equal(byPhone.gateway, "PAYFOR"); assert.equal(byPhone.reason, "COUNTRY_RULE"); assert.equal(byPhone.ruleCountry, "AE");
  assert.equal(decideNewCardRoute({ ...base, ipCountry: "AE", countryRules: [AE_PHONE] }).reason, "DEFAULT", "a phone-only rule ignores IP");
  assert.equal(decideNewCardRoute({ ...base, ipCountry: "AE", countryRules: [{ ...AE_PHONE, matchBy: "IP" }] }).gateway, "PAYFOR");
  const both = decideNewCardRoute({ ...base, ipCountry: "AE", phone: "+905551234567", countryRules: [{ country: "AE", gateway: "PAYFOR", matchBy: "ANY" }, { country: "TR", gateway: "ALBARAKA", matchBy: "ANY" }] });
  assert.equal(both.ruleCountry, "TR", "the donor's own phone wins over where they are");
});

test("Saudi Arabia in the list behaves exactly like the old setting, reasons included", () => {
  for (const extra of [{ phone: "+966501234567" }, { ipCountry: "SA" }, { phone: "+966501234567", ipCountry: "SA" }]) {
    const old = decideNewCardRoute({ ...base, ...extra, saudiEnabled: true });
    const moved = decideNewCardRoute({ ...base, ...extra, saudiEnabled: false, countryRules: [SA] });
    const { ruleCountry, ...rest } = moved;
    assert.equal(ruleCountry, "SA");
    assert.deepEqual(rest, old, JSON.stringify(extra));
  }
});

test("never to a disabled PayFor; without any configuration every route is exactly as before", () => {
  const off = decideNewCardRoute({ ...base, payforEnabled: false, donorOverride: "PAYFOR", countryRules: [SA], phone: "+966501234567" });
  assert.deepEqual(off, decideNewCardRoute({ ...base, payforEnabled: false, phone: "+966501234567" }));
  for (const extra of [{}, { phone: "+966501234567", saudiEnabled: true }, { currency: "TRY" }, { ipCountry: "SA", saudiEnabled: true }]) {
    assert.deepEqual(decideNewCardRoute({ ...base, ...extra, donorOverride: null, countryRules: [] }), decideNewCardRoute({ ...base, ...extra }));
  }
  assert.equal(decideNewCardRoute({ ...base, donationType: "MONTHLY", donorOverride: "PAYFOR", countryRules: [SA], phone: "+966501234567" }).reason === "DONOR_OVERRIDE", false, "subscriptions are not moved");
});

type Doc = Record<string, unknown>;
type Prefs = { donorOverride: string | null; countryRules: CountryGatewayRule[]; saudiMigrated: boolean; needsIp: boolean } | null;
type Store = {
  phoneKey: (v: unknown) => string | null;
  routingPreferences: (i: { userId?: string | null; phone?: unknown; saudiSettingEnabled: boolean }) => Promise<Prefs>;
  setDonorGatewayOverride: (i: { userId: string; choice: string; reason: string; by: string }) => Promise<{ from: string; to: string }>;
  setCountryGatewayRule: (i: { country: string; choice: string; matchBy: string; reason: string; by: string }) => Promise<{ from: string; to: string }>;
  readDonorOverrideLog: () => Promise<Array<{ scope: string; from: string; to: string; country?: string; by: string }>>;
};
type Db = { fail: boolean; reads: number; collections: Record<string, Doc[]> };
/** Runs the real store module against an in-memory database. */
function loadStore(db: Db): Store {
  const out = ts.transpileModule(fs.readFileSync("lib/donations/donor-gateway-override.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const col = (n: string): Doc[] => (db.collections[n] ??= []);
  const matches = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => d[k] === v);
  const prisma = {
    $runCommandRaw: async (c: Doc): Promise<Doc> => {
      if (db.fail) throw new Error("db down");
      if (typeof c.find === "string") { db.reads++; return { cursor: { firstBatch: col(c.find).filter((d) => matches(d, c.filter as Doc)) } }; }
      if (typeof c.update === "string") {
        const upserted: Doc[] = [];
        for (const u of c.updates as Array<{ q: Doc; u: { $set?: Doc; $setOnInsert?: Doc } }>) {
          const d = col(c.update as string).find((x) => matches(x, u.q));
          if (d) { if (u.u.$set) Object.assign(d, u.u.$set); } else { col(c.update as string).push({ ...u.q, ...(u.u.$set ?? {}), ...(u.u.$setOnInsert ?? {}) }); upserted.push({}); }
        }
        return { ok: 1, upserted };
      }
      if (typeof c.delete === "string") { for (const q of c.deletes as Array<{ q: Doc }>) db.collections[c.delete] = col(c.delete).filter((d) => !matches(d, q.q)); return { ok: 1 }; }
      if (typeof c.insert === "string") { col(c.insert).push(...(c.documents as Doc[])); return { ok: 1 }; }
      throw new Error("unsupported");
    },
    user: { findUnique: async (a: { where: { id: string } }) => ({ id: a.where.id, phone: "+90 555 123 45 67" }) },
  };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Date, JSON, Map, Set, Math, Promise, String, Array,
    require: (n: string) => (n === "server-only" ? {} : n === "../prisma" ? { prisma } : (() => { throw new Error("unexpected " + n); })()) });
  return mod.exports as unknown as Store;
}
const DONOR = "6af674e2d1cd34cbb9de7d1a";
const fresh = (): Db => ({ fail: false, reads: 0, collections: {} });

test("the old Saudi setting moves into the list once, only if it was on, and is logged", async () => {
  const on = fresh(), s = loadStore(on);
  const p = await s.routingPreferences({ saudiSettingEnabled: true });
  assert.deepEqual(JSON.parse(JSON.stringify(p?.countryRules)), [{ country: "SA", gateway: "PAYFOR", matchBy: "ANY" }]);
  assert.equal(p?.saudiMigrated, true); assert.equal(p?.needsIp, true);
  await s.routingPreferences({ saudiSettingEnabled: true });
  assert.equal(on.collections.GatewayCountryRule.length, 1, "idempotent");
  assert.equal((await s.readDonorOverrideLog()).filter((l) => l.country === "SA").length, 1);
  const off = fresh(), s2 = loadStore(off);
  const p2 = await s2.routingPreferences({ saudiSettingEnabled: false });
  assert.equal(p2?.countryRules.length, 0); assert.equal(p2?.saudiMigrated, true, "migrated without creating a rule");
});

test("after the move, removing Saudi Arabia from the list really stops it", async () => {
  const s = loadStore(fresh());
  await s.routingPreferences({ saudiSettingEnabled: true });
  await s.setCountryGatewayRule({ country: "SA", choice: "AUTO", matchBy: "ANY", reason: "stop", by: "admin" });
  const p = await s.routingPreferences({ saudiSettingEnabled: true });
  assert.equal(p?.countryRules.length, 0); assert.equal(p?.saudiMigrated, true, "the old setting is not used again");
});

test("donor pins are found by account or phone; every change is logged; checkout reads come from memory", async () => {
  const db = fresh(), s = loadStore(db);
  await s.setDonorGatewayOverride({ userId: DONOR, choice: "PAYFOR", reason: "Albaraka rejects the card", by: "admin" });
  assert.equal((await s.routingPreferences({ userId: DONOR, saudiSettingEnabled: false }))?.donorOverride, "PAYFOR");
  assert.equal((await s.routingPreferences({ phone: "0090 555 1234567", saudiSettingEnabled: false }))?.donorOverride, "PAYFOR");
  const before = db.reads;
  for (let i = 0; i < 20; i++) await s.routingPreferences({ userId: DONOR, saudiSettingEnabled: false });
  assert.equal(db.reads, before, "no database reads per checkout");
  await s.setCountryGatewayRule({ country: "AE", choice: "PAYFOR", matchBy: "PHONE", reason: "test", by: "admin" });
  assert.equal((await s.routingPreferences({ saudiSettingEnabled: false }))?.needsIp, false, "phone-only rules never trigger the IP lookup");
  const log = await s.readDonorOverrideLog();
  assert.deepEqual(log.map((l) => [l.scope, l.to]).sort(), [["COUNTRY", "PAYFOR"], ["DONOR", "PAYFOR"]]);
  assert.equal(await loadStore({ ...fresh(), fail: true }).routingPreferences({ userId: DONOR, saudiSettingEnabled: true }), null, "any problem → route as before");
});

test("phone keys match however the number is typed", () => {
  const s = loadStore(fresh());
  for (const v of ["+90 555 123 45 67", "0090 555 1234567", "٩٠٥٥٥١٢٣٤٥٦٧"]) assert.equal(s.phoneKey(v), "905551234567");
});

test("wiring: lazy fail-safe router hook, legacy Saudi only before the move, admin-only API, translated section", () => {
  const r = fs.readFileSync("lib/donations/payment-routing-server.ts", "utf8");
  assert.match(r, /await import\("\.\/donor-gateway-override"\)[\s\S]*?\.catch\(\(\) => null\)/);
  assert.match(r, /const saudiEnabled = saudiSetting && !prefs\?\.saudiMigrated;/);
  assert.match(r, /if \(legacySaudi \|\| prefs\?\.needsIp\) try/);
  const a = fs.readFileSync("app/api/admin/donor-gateway-override/route.ts", "utf8");
  assert.equal((a.match(/requireAdminSession\(session\)/g) ?? []).length, 2);
  assert.match(a, /reason\.length < 3/); assert.match(a, /COUNTRY_GATEWAY_RULE/); assert.match(a, /DONOR_GATEWAY_OVERRIDE/);
  assert.match(fs.readFileSync("app/(dashboard)/dashboard/security/page.tsx", "utf8"), /<SiteSecurityManager \/>\s*<DonorGatewayOverrides \/>/);
  const ui = fs.readFileSync("app/(dashboard)/dashboard/security/DonorGatewayOverrides.tsx", "utf8");
  for (const lang of ["en", "tr"]) {
    const cat = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${lang}.json`, "utf8")) as Record<string, string>;
    for (const m of ui.matchAll(/dt\("([^"]+)"/g)) assert.ok(cat[m[1]], `${lang}: ${m[1]}`);
  }
});
