import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { maskedSavedCards } from "../../lib/donations/saved-card-display";
import { checkCardFields } from "../../lib/minbar/card-validation";

function fixture(signedIn = true, duplicate = false) {
  const calls: Array<{ where: { userId: string } }> = [];
  const rows: Array<{ id: string; userId: string; cvc: string; cardNumber: string }> = [];
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init: ResponseInit = {}) => Response.json(body, init) } },
    "next-auth": { getServerSession: async () => signedIn ? { user: { id: "owner" } } : null }, "@/app/api/auth/[...nextauth]/options": {},
    "@/lib/card-crypto": { encryptCard: (number: string) => `encrypted:${number}`, decryptCard: (number: string) => number.replace("encrypted:", ""), detectCardType: () => "VISA" },
    "@/lib/minbar/card-validation": { checkCardFields },
    "@/lib/donations/saved-card-display": { maskedSavedCards },
    "@/lib/prisma": { prisma: { creditCard: {
      findMany: async (args: { where: { userId: string } }) => { calls.push(args); return duplicate ? [{ id: "other-first", cardNumber: "encrypted:5555555555554444" }, { id: "existing", cardNumber: "encrypted:4242424242424242" }] : rows; },
      count: async () => rows.length, updateMany: async () => { throw new Error("Default mutation was not requested"); },
      create: async ({ data }: { data: Omit<(typeof rows)[number], "id"> }) => { const row = { id: "saved", ...data }; rows.push(row); return row; },
    } } },
  };
  const mod = { exports: {} as { GET: () => Promise<Response>; POST: (request: Request) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync("app/api/credit-cards/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; } });
  return { rows, calls, get: mod.exports.GET, post: (body: unknown) => mod.exports.POST(new Request("https://minberiaksa.org/api/credit-cards", { method: "POST", body: JSON.stringify(body) })) };
}
const valid = { cardNumber: "4242 4242 4242 4242", expiryDate: "12/30", cvc: "123", cardholderName: "Sample Donor" };
test("saving a valid card stores encrypted PAN, never CVC, and returns only the masked suffix", async () => {
  const f = fixture(); const result = await f.post(valid); assert.equal(result.status, 200);
  assert.equal(f.rows[0].cvc, ""); assert.equal(f.rows[0].cardNumber, "encrypted:4242424242424242"); assert.equal(f.rows[0].userId, "owner");
  const response = await result.json(); assert.equal(response.card.last4, "4242"); assert.equal(response.card.cardNumber, undefined); assert.equal(response.card.cvc, undefined);
  const list = await f.get(); const listed = await list.json(); assert.equal(listed.cards[0].last4, "4242"); assert.equal(listed.cards[0].cvc, undefined);
  assert.equal(list.headers.get("cache-control"), "no-store, private"); assert.ok(f.calls.every(call => call.where.userId === "owner"));
});
test("duplicate detection examines every candidate and does not confuse matching suffixes with the same card", async () => {
  const f = fixture(true, true); const response = await (await f.post(valid)).json(); assert.equal(response.card.id, "existing"); assert.equal(response.alreadySaved, true); assert.equal(f.rows.length, 0);
});
test("anonymous and malformed card writes are rejected before a database write", async () => {
  const anonymous = fixture(false); assert.equal((await anonymous.post(valid)).status, 401); assert.equal((await anonymous.get()).status, 401); assert.equal(anonymous.calls.length, 0);
  const f = fixture();
  for (const body of [null, [], { ...valid, cardNumber: 4242 }, { ...valid, cvc: 123 }, { ...valid, cardholderName: {} }, { ...valid, setAsDefault: "true" }, { ...valid, cardNumber: "4242424242424241" }, { ...valid, expiryDate: "01/20" }]) assert.equal((await f.post(body)).status, 400);
  assert.equal(f.rows.length, 0); assert.equal(f.calls.length, 0);
});
