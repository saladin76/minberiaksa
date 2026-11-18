import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { daysLeft, dueRenewals, nextRenewal, renewalLevel, type ServiceRenewal } from "../../lib/service-renewals/shared";

const NOW = new Date("2026-11-18T10:00:00Z");
const item = (renewsAt: string | null, extra: Partial<ServiceRenewal> = {}): ServiceRenewal => ({ id: "x", name: "S", provider: "P", renewsAt, cycle: "MONTHLY", amount: null, currency: null, cardLast4: null, owner: null, billingUrl: null, notes: null, lastConfirmedAt: null, ...extra });

test("alert levels: 14 days soon, 7 near, 3 urgent, past the date overdue, no date asks for one", () => {
  const at = (days: number) => new Date(Date.UTC(2026, 10, 18 + days)).toISOString().slice(0, 10);
  assert.equal(renewalLevel(item(at(15)), NOW), "NONE");
  assert.equal(renewalLevel(item(at(14)), NOW), "SOON");
  assert.equal(renewalLevel(item(at(7)), NOW), "NEAR");
  assert.equal(renewalLevel(item(at(3)), NOW), "URGENT");
  assert.equal(renewalLevel(item(at(0)), NOW), "URGENT");
  assert.equal(renewalLevel(item(at(-1)), NOW), "OVERDUE");
  assert.equal(renewalLevel(item(null), NOW), "NO_DATE");
  assert.equal(daysLeft(at(5), NOW), 5);
});

test("confirming a renewal moves to the next date still ahead, keeping the day of the month", () => {
  assert.equal(nextRenewal("2026-11-20", "MONTHLY", NOW), "2026-12-20");
  assert.equal(nextRenewal("2026-11-20", "YEARLY", NOW), "2027-11-20");
  assert.equal(nextRenewal("2026-01-31", "MONTHLY", new Date("2026-01-31T00:00:00Z")), "2026-02-28", "month end is clamped");
  assert.equal(nextRenewal("2026-08-10", "MONTHLY", NOW), "2026-12-10", "missed cycles are skipped to the next one ahead");
  assert.equal(nextRenewal("2026-11-20", "ONCE", NOW), null);
});

test("the banner lists only what needs attention, most urgent first", () => {
  const list = [item("2027-01-01", { id: "far" }), item(null, { id: "nodate" }), item("2026-11-25", { id: "near" }), item("2026-11-10", { id: "late" }), item("2026-11-20", { id: "urgent" })];
  assert.deepEqual(dueRenewals(list, NOW).map((i) => i.id), ["late", "urgent", "near"]);
});

type Doc = Record<string, unknown>;
type Store = {
  listRenewals: () => Promise<Array<{ id: string; name: string; renewsAt: string | null; auto?: string }>>;
  createRenewal: (i: Record<string, unknown>, by: string) => Promise<string>;
  confirmRenewal: (id: string, by: string, now?: Date) => Promise<string | null>;
  deleteRenewal: (id: string, by: string) => Promise<void>;
  cleanRenewal: (i: Record<string, unknown>, partial: boolean) => Record<string, unknown>;
};
function loadStore(db: { docs: Record<string, Doc[]> }): Store {
  const js = (f: string) => ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const shared: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(js("lib/service-renewals/shared.ts"), { module: shared, exports: shared.exports, Date, Math, Number });
  const col = (n: string) => (db.docs[n] ??= []);
  const match = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => (v && typeof v === "object" && "$ne" in (v as Doc) ? d[k] !== (v as Doc).$ne : d[k] === v));
  let n = 0;
  const prisma = { $runCommandRaw: async (c: Doc): Promise<Doc> => {
    if (typeof c.find === "string") return { cursor: { firstBatch: col(c.find).filter((d) => match(d, c.filter as Doc)) } };
    if (typeof c.insert === "string") { col(c.insert).push(...(c.documents as Doc[])); return { ok: 1 }; }
    if (typeof c.update === "string") { const ups: Doc[] = []; for (const u of c.updates as Array<{ q: Doc; u: { $set?: Doc; $setOnInsert?: Doc } }>) { const d = col(c.update as string).find((x) => match(x, u.q)); if (d) Object.assign(d, u.u.$set ?? {}); else { col(c.update as string).push({ ...u.q, ...(u.u.$setOnInsert ?? {}) }); ups.push({}); } } return { ok: 1, upserted: ups }; }
    throw new Error("unsupported"); } };
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  vm.runInNewContext(js("lib/service-renewals/store.ts"), { module: mod, exports: mod.exports, Date, JSON, Math, Promise, Number, Object, String, Array,
    require: (name: string) => name === "server-only" ? {} : name === "../prisma" ? { prisma } : name === "./shared" ? shared.exports
      : name === "node:crypto" ? { randomBytes: () => ({ toString: () => (++n).toString(16).padStart(24, "0") }) }
      : name === "node:tls" ? { default: { connect: (_o: unknown, cb: () => void) => { const s = { getPeerCertificate: () => ({ valid_to: "Jan 11 05:13:57 2027 GMT" }), end() {}, on() { return s; } }; setTimeout(cb, 0); return s; } } }
      : (() => { throw new Error("unexpected " + name); })() });
  return mod.exports as unknown as Store;
}

test("pre-filled once, SSL read automatically, renewals confirmed and removed", async () => {
  const db = { docs: {} as Record<string, Doc[]> }, s = loadStore(db);
  const first = await s.listRenewals();
  assert.ok(first.length >= 9, "the services the site depends on, plus SSL");
  assert.equal(first.find((i) => i.auto === "SSL")?.renewsAt, "2027-01-11");
  for (const i of first.filter((x) => !x.auto)) await s.deleteRenewal(i.id, "a");
  assert.equal((await s.listRenewals()).filter((i) => !i.auto).length, 0, "never pre-filled again");
  const id = await s.createRenewal({ name: "Cloudinary", provider: "Cloudinary", renewsAt: "2026-11-20", cycle: "MONTHLY", amount: 89, currency: "usd", cardLast4: "4521" }, "a");
  assert.equal(await s.confirmRenewal(id, "a", NOW), "2026-12-20");
  const once = await s.createRenewal({ name: "Setup", provider: "X", renewsAt: "2026-11-19", cycle: "ONCE" }, "a");
  assert.equal(await s.confirmRenewal(once, "a", NOW), null);
  assert.equal((await s.listRenewals()).some((i) => i.id === once), false, "a one-time item disappears after confirmation");
  assert.ok((db.docs.ServiceRenewalLog ?? []).some((l) => l.action === "CONFIRM" && l.to === "2026-12-20"), "every confirmation is logged");
});

test("bad input is refused, and only the last four card digits are ever accepted", () => {
  const s = loadStore({ docs: {} });
  for (const [bad, code] of [[{ name: "" }, "INVALID_NAME"], [{ name: "A", cycle: "MONTHLY", renewsAt: "20-11-2026" }, "INVALID_DATE"], [{ name: "A", cycle: "MONTHLY", cardLast4: "4111111111111111" }, "INVALID_CARD"], [{ name: "A", cycle: "MONTHLY", billingUrl: "javascript:alert(1)" }, "INVALID_URL"], [{ name: "A", cycle: "WEEKLY" }, "INVALID_CYCLE"]] as const)
    assert.throws(() => s.cleanRenewal(bad as Record<string, unknown>, false), new RegExp(code));
  assert.equal(s.cleanRenewal({ name: "A", cycle: "YEARLY", currency: "try" }, false).currency, "TRY");
});

test("wiring: admin-only API and page, banner in the dashboard layout, translated", () => {
  const api = fs.readFileSync("app/api/admin/service-renewals/route.ts", "utf8");
  assert.equal((api.match(/const \{[^}]*denied[^}]*\} = await admin\(\);\s*\n\s*if \(denied\) return denied;/g) ?? []).length, 4);
  assert.match(fs.readFileSync("app/(dashboard)/dashboard/renewals/page.tsx", "utf8"), /role !== "ADMIN"\) redirect/);
  const layout = fs.readFileSync("app/(dashboard)/dashboard/layout.tsx", "utf8");
  assert.match(layout, /<RenewalAlerts \/>\{children\}/);
  for (const f of ["app/(dashboard)/dashboard/renewals/RenewalsManager.tsx", "components/dashboard/RenewalAlerts.tsx"]) {
    const ui = fs.readFileSync(f, "utf8");
    for (const lang of ["en", "tr"]) {
      const cat = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${lang}.json`, "utf8")) as Record<string, string>;
      for (const m of ui.matchAll(/dt\("([^"]+)"/g)) assert.ok(cat[m[1]], `${lang}: ${m[1]}`);
    }
  }
});
