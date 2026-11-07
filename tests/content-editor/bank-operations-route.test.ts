import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function fixture(role: string | null = "ADMIN", permission = true) {
  let calls = 0, reads = 0;
  const loaded = { exports: {} as { GET: (req: Request, ctx: unknown) => Promise<Response>; POST: (req: Request, ctx: unknown) => Promise<Response> } };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, "next-auth": { getServerSession: async () => role ? { user: { id: "2".repeat(24), role, name: "QA" } } : null }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/dashboard/permissions": { sessionHasDashboardPermission: () => permission }, "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
    "@/lib/prisma": { prisma: { donation: { findUnique: async () => { reads++; return { id: "1".repeat(24), status: "PAID", paidAt: new Date() }; } } } },
    "@/lib/donations/bank-operations-core": { object: (value: unknown) => value && typeof value === "object" ? value : {}, bankBalance: () => ({ sale: { provider: "ALBARAKA", amountMinor: 1000, currency: "EUR" }, operations: [], remainingMinor: 1000 }), BANK_OPERATION_ERRORS: ["INVALID_REQUEST"] },
    "@/lib/donations/bank-operations-provider": { bankOperationsReady: () => ({ ready: true }), callBankOperation: () => { throw new Error("No real bank permitted in route fixture"); } },
    "@/lib/donations/bank-operations-service": { bankDonationSelect: {}, executeBankAdjustment: async () => { calls++; return { state: "SUCCEEDED" }; }, inquireBankDonation: async () => { calls++; return {}; }, resolveBankAdjustment: async () => { calls++; return {}; } },
  };
  const source = ts.transpileModule(fs.readFileSync("app/api/admin/donations/[id]/bank-operations/route.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new vm.Script(source).runInNewContext({ module: loaded, exports: loaded.exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const ctx = { params: Promise.resolve({ id: "1".repeat(24) }) };
  return { ...loaded.exports, calls: () => calls, reads: () => reads, ctx };
}
const request = (body: unknown, origin = "https://minberiaksa.org") => new Request("https://minberiaksa.org/api/admin/donations/" + "1".repeat(24) + "/bank-operations", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const refund = { action: "REFUND", key: "a-valid-request-key", amount: "2.00", currency: "EUR", reason: "QA donor request", confirmed: true };
test("unauthenticated and unauthorized users cannot read or call a bank", async () => { for (const h of [fixture(null), fixture("STAFF", false)]) { assert.ok((await h.GET(new Request("https://minberiaksa.org"), h.ctx)).status >= 401); assert.ok((await h.POST(request(refund), h.ctx)).status >= 401); assert.equal(h.calls(), 0); assert.equal(h.reads(), 0); } });
test("staff readers can inquire but cannot send refunds, voids or reconciliations", async () => { const h = fixture("STAFF"); for (const action of ["REFUND", "VOID", "RECONCILE"]) assert.equal((await h.POST(request({ ...refund, action }), h.ctx)).status, 403); assert.equal(h.calls(), 0); assert.equal((await h.POST(request({ action: "INQUIRE" }), h.ctx)).status, 200); assert.equal(h.calls(), 1); });
test("cross-origin financial requests and missing confirmations cannot reach the bank", async () => { const h = fixture(); assert.equal((await h.POST(request(refund, "https://foreign.invalid"), h.ctx)).status, 403); assert.equal((await h.POST(request({ ...refund, confirmed: false }), h.ctx)).status, 409); assert.equal(h.calls(), 0); });
test("opening the financial panel is read-only; a valid confirmed admin action reaches only the service", async () => { const h = fixture(); const response = await h.GET(new Request("https://minberiaksa.org"), h.ctx); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store"); assert.equal(h.calls(), 0); assert.equal((await h.POST(request(refund), h.ctx)).status, 200); assert.equal(h.calls(), 1); });
