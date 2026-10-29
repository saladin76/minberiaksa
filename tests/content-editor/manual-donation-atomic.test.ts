import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { ensureOptionalUserEmailIndex } from "../../lib/donations/optional-user-email-index";
// Dynamic Prisma-shaped records are confined to this isolated route fixture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
function isolated(file: string, dependencies: Record<string, unknown>) {
  const loaded = { exports: {} as Row };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, console: { error() {} }, require: (id: string) => { if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`); return dependencies[id]; } });
  return loaded.exports;
}
const oid = (n: number) => n.toString(16).padStart(24, "0");
function harness() {
  let state: Row = { users: [], donations: [], campaign: 0, category: 0 };
  let fxFailure = false, projectMissing = false, ledgerFailure = false, allowed = true, conversions = 0;
  const db = (get: () => Row): Row => ({
    user: {
      findUnique: async ({ where }: Row) => get().users.find((row: Row) => where.id ? row.id === where.id : row.email === where.email) ?? null,
      create: async ({ data }: Row) => { const row = { ...data, id: oid(get().users.length + 100) }; get().users.push(row); return row; },
    },
    donation: {
      findUnique: async ({ where }: Row) => get().donations.find((row: Row) => row.id === where.id) ?? null,
      create: async ({ data }: Row) => { if (get().donations.some((row: Row) => row.id === data.id)) throw Object.assign(new Error(), { code: "P2002" }); const row = { ...data, id: data.id ?? oid(500), donorId: data.donor.connect.id }; get().donations.push(row); return { id: row.id }; },
    },
    campaign: { count: async ({ where }: Row) => projectMissing ? 0 : where.id.in.length, update: async ({ data }: Row) => { if (ledgerFailure) throw new Error("ledger failed"); get().campaign += data.currentAmount.increment; } },
    category: { count: async ({ where }: Row) => where.id.in.length, update: async ({ data }: Row) => { get().category += data.currentAmount.increment; } },
  });
  const prisma = { ...db(() => state), $transaction: async (work: (tx: Row) => Promise<unknown>) => { const draft = JSON.parse(JSON.stringify(state)); const result = await work(db(() => draft)); state = draft; return result; } };
  const route = isolated("app/api/admin/donations/route.ts", {
    "node:crypto": { createHash }, "libphonenumber-js": { getCountries: () => ["EG", "TR", "US"] }, "@prisma/client": {},
    "next/server": { NextResponse: { json: (body: unknown, options: Row = {}) => ({ body, status: options.status ?? 200 }) } },
    "next-auth": { getServerSession: async () => allowed ? { user: { id: oid(1), role: "ADMIN" } } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} }, "@/lib/prisma": { prisma },
    "@/lib/dashboard/permissions": { userHasDashboardPermission: () => false },
    "@/lib/exchange/convert-amount-in-currency-to-usd": { normalizeDonationCurrencyCode: (value: string) => value, convertAmountInCurrencyToUsd: async (amount: number, currency: string) => { conversions++; if (fxFailure) throw new Error("FX unavailable"); return amount * (currency === "EUR" ? 2 : 1); } },
    "@/lib/donations/donor-country-code": { getDonorCountryCodeForSnapshot: async () => null },
    "@/lib/audit-log": { writeAuditLog: async () => {}, auditActorFromDashboardSession: () => ({ actorId: oid(1) }) },
    "@/lib/donations/access-token": { mintDonationAccessToken: () => "test-token" },
  });
  const body = { donor: { mode: "NEW", name: "Offline donor" }, requestId: oid(10), donorCountryCode: "EG", provider: "CASH", currency: "EUR", items: [{ campaignId: oid(20), amount: 10 }], categoryItems: [{ categoryId: oid(30), amount: 5 }] };
  return { body, post: (input: unknown = body) => route.POST({ json: async () => input }), state: () => state, conversions: () => conversions, set: (key: string, value: boolean) => { if (key === "fx") fxFailure = value; if (key === "project") projectMissing = value; if (key === "ledger") ledgerFailure = value; if (key === "allowed") allowed = value; } };
}
test("manual cash donation saves country, donor and USD ledger atomically; exact retries never create another payment", async () => {
  const h = harness(); assert.equal((await h.post()).status, 201);
  assert.equal(h.state().users.length, 1); assert.equal(h.state().users[0].email, undefined);
  assert.equal(h.state().donations[0].provider, "CASH"); assert.equal(h.state().donations[0].donorCountryCode, "EG");
  assert.equal(h.state().campaign, 20); assert.equal(h.state().category, 10); assert.equal(h.state().donations[0].amountUSD, 30);
  const conversions = h.conversions(); h.set("fx", true);
  assert.equal((await h.post()).status, 200); assert.equal(h.conversions(), conversions);
  assert.equal(h.state().donations.length, 1); assert.equal(h.state().campaign, 20);
  assert.equal((await h.post({ ...h.body, currency: "USD" })).status, 409);
});
test("invalid projects, exchange failures and ledger failures leave no orphan donor or partial donation", async () => {
  for (const key of ["project", "fx", "ledger"]) {
    const h = harness(); h.set(key, true); assert.ok((await h.post()).status >= 400);
    assert.equal(h.state().users.length, 0); assert.equal(h.state().donations.length, 0); assert.equal(h.state().campaign, 0);
  }
});
test("manual entry rejects invalid countries and unauthorized callers before writes", async () => {
  const h = harness(); assert.equal((await h.post({ ...h.body, donorCountryCode: "ZZ" })).status, 400);
  h.set("allowed", false); assert.equal((await h.post()).status, 401); assert.equal(h.state().users.length, 0);
});
test("optional email index is created and verified before legacy uniqueness is removed", async () => {
  const commands: Row[] = [], indexes: Row[] = [{ name: "User_email_key", key: { email: 1 }, unique: true }];
  const db = { $runCommandRaw: async (command: Row) => { commands.push(command); if (command.listIndexes) return { cursor: { firstBatch: [...indexes] } }; if (command.createIndexes) indexes.push(command.indexes[0]); return { ok: 1 }; } };
  assert.equal(await ensureOptionalUserEmailIndex(db as never, true), false); assert.equal(commands.length, 1); commands.length = 0;
  assert.equal(await ensureOptionalUserEmailIndex(db as never), true);
  assert.deepEqual(commands.map(row => Object.keys(row)[0]), ["listIndexes", "createIndexes", "listIndexes", "dropIndexes"]);
  assert.deepEqual(indexes[1].partialFilterExpression, { email: { $type: "string" } });
});
test("failed replacement creation and custom collation never drop existing email uniqueness", async () => {
  for (const custom of [false, true]) {
    let drops = 0;
    const db = { $runCommandRaw: async (command: Row) => { if (command.dropIndexes) drops++; if (command.createIndexes) throw new Error("creation failed"); return { cursor: { firstBatch: [{ name: "User_email_key", key: { email: 1 }, unique: true, ...(custom ? { collation: { locale: "en", strength: 2 } } : {}) }] } }; } };
    await assert.rejects(ensureOptionalUserEmailIndex(db as never)); assert.equal(drops, 0);
  }
});
