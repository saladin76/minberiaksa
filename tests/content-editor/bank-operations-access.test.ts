import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture(role: string | null = "ADMIN", permission = true) {
  let reads = 0, writes = 0, inquiries = 0;
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } },
    "next-auth": { getServerSession: async () => role ? { user: { id: "admin", role, name: "Admin" } } : null },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/permissions": { sessionHasDashboardPermission: () => permission },
    "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://fixture.test" },
    "@/lib/prisma": { prisma: { donation: { findUnique: async () => { reads++; return {}; } } } },
    "@/lib/donations/bank-operations-core": { object: (v: unknown) => v || {}, bankBalance: () => ({ sale: {}, operations: [] }), BANK_OPERATION_ERRORS: ["INVALID_REQUEST"] },
    "@/lib/donations/bank-operations-provider": { bankOperationsReady: () => ({ ready: true }), callBankOperation: () => {} },
    "@/lib/donations/bank-operations-service": { bankDonationSelect: {}, executeBankAdjustment: async () => { writes++; return { state: "SUCCEEDED" }; }, resolveBankAdjustment: async () => { writes++; }, inquireBankDonation: async () => { inquiries++; return { state: "UNKNOWN" }; } },
  };
  const mod = { exports: {} as { GET: (req: Request, ctx: unknown) => Promise<Response>; POST: (req: Request, ctx: unknown) => Promise<Response> } };
  const code = ts.transpileModule(fs.readFileSync("app/api/admin/donations/[id]/bank-operations/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const context = { params: Promise.resolve({ id: "a".repeat(24) }) };
  return { get: () => mod.exports.GET(new Request("https://fixture.test/api"), context), post: (body: unknown, origin = "https://fixture.test") => mod.exports.POST(new Request("https://fixture.test/api", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }), context), stats: () => ({ reads, writes, inquiries }) };
}
test("bank operations authenticate and enforce section permission before reads or provider calls", async () => {
  for (const f of [fixture(null), fixture("STAFF", false)]) { assert.ok([401,403].includes((await f.get()).status)); assert.ok([401,403].includes((await f.post({ action: "INQUIRE" })).status)); assert.deepEqual(f.stats(), { reads: 0, writes: 0, inquiries: 0 }); }
});
test("staff may inquire but cannot void, refund or reconcile", async () => {
  const f = fixture("STAFF"); assert.equal((await f.post({ action: "INQUIRE" })).status, 200);
  for (const action of ["VOID", "REFUND", "RECONCILE"]) assert.equal((await f.post({ action, confirmed: true })).status, 403);
  assert.deepEqual(f.stats(), { reads: 0, writes: 0, inquiries: 1 });
});
test("an explicit confirmation, valid request and same origin are required for administrator mutations", async () => {
  const f = fixture();
  assert.equal((await f.post({ action: "INQUIRE" }, "https://foreign.test")).status, 403);
  for (const body of [null, [], {}, { action: "REFUND", confirmed: false }, { action: "REFUND", confirmed: true, currency: "EUR", key: "short", reason: "Reason" }]) assert.equal((await f.post(body)).status, 409);
  assert.equal(f.stats().writes, 0);
});
