/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated Prisma fault-injection fixtures. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
type Data = Record<string, any>;
const owner = "a".repeat(24), cardId = "b".repeat(24), nextId = "c".repeat(24);
function fixture() {
  const state: Data = { session: { user: { id: owner } }, card: { id: cardId, userId: owner, isDefault: true }, linked: 0, pending: 0, writes: [], reads: 0, broken: false };
  const tx = { creditCard: {
    findFirst: async ({ where }: Data) => { state.reads++; if (state.broken) throw Error("db failed"); return where.id ? state.card?.userId === where.userId ? state.card : null : { id: nextId }; },
    updateMany: async (args: Data) => { state.writes.push(["unset", args]); return { count: 1 }; },
    update: async (args: Data) => { state.writes.push(["update", args]); return { id: args.where.id, isDefault: true, nickname: "Fixture" }; },
    delete: async (args: Data) => { state.writes.push(["delete", args]); return state.card; },
  }, subscription: { count: async () => state.linked }, subscriptionCardVerification: { count: async () => state.pending } };
  const deps: Data = {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), init) } },
    "next-auth": { getServerSession: async () => state.session }, "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma: { $transaction: async (fn: (client: unknown) => unknown) => fn(tx) } },
    "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minber.test" },
  };
  const mod = { exports: {} as Data };
  runInNewContext(ts.transpileModule(readFileSync("app/api/credit-cards/[id]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const invoke = (method: string, body: unknown = { nickname: "Fixture" }, origin = "https://minber.test", id = cardId) => mod.exports[method](new Request("https://minber.test/api/credit-cards/" + id, { method, headers: { origin, "Content-Type": "application/json" }, ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ id }) });
  return { state, invoke };
}
test("payment-card edits require the owner, valid input and same-origin requests before writing", async () => {
  const anon = fixture(); anon.state.session = null; assert.equal((await anon.invoke("PATCH")).status, 401); assert.equal(anon.state.reads, 0);
  const foreign = fixture(); foreign.state.card.userId = "d".repeat(24); assert.equal((await foreign.invoke("PATCH")).status, 404); assert.equal(foreign.state.writes.length, 0);
  for (const body of [null, [], {}, { cardNumber: "4242424242424242" }, { cvc: "123" }, { nickname: 3 }, { nickname: "x".repeat(81) }, { isDefault: false }]) {
    const f = fixture(); assert.equal((await f.invoke("PATCH", body)).status, 400); assert.equal(f.state.writes.length, 0);
  }
  const cross = fixture(); assert.equal((await cross.invoke("PATCH", {}, "https://other.test")).status, 403); assert.equal(cross.state.reads, 0);
});
test("default-card edits select public metadata only and never change a subscription", async () => {
  const f = fixture(), response = await f.invoke("PATCH", { isDefault: true });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.writes[1][1].select)), { id: true, nickname: true, isDefault: true });
  assert.doesNotMatch(JSON.stringify(await response.json()), /cardNumber|cvc|encrypted/);
  assert.equal(f.state.writes.length, 2); assert.equal(f.state.writes[0][1].where.userId, owner);
});
test("linked plans and pending verification block deletion; unused default removal promotes an owned card", async () => {
  for (const key of ["linked", "pending"]) { const f = fixture(); f.state[key] = 1; assert.equal((await f.invoke("DELETE")).status, 409); assert.equal(f.state.writes.length, 0); }
  const f = fixture(); assert.equal((await f.invoke("DELETE")).status, 200); assert.equal(f.state.writes[0][0], "delete"); assert.equal(f.state.writes[1][1].where.id, nextId);
  const down = fixture(); down.state.broken = true; assert.equal((await down.invoke("DELETE")).status, 503); assert.equal(down.state.writes.length, 0);
});
