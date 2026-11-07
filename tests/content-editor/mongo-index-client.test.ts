import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ensureOptionalUserEmailIndex } from "../../lib/donations/optional-user-email-index";

test("native index transport preserves Mongo $type metadata that collides with Prisma's protocol tag", async () => {
  let connected = 0, closed = 0;
  const indexes = [{ name: "User_email_string_unique", key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: "string" } } }];
  class MongoClient {
    async connect() { connected++; }
    db() { return { command: async (command: Record<string, unknown>) => { assert.equal(command.listIndexes, "User"); return { cursor: { firstBatch: indexes } }; } }; }
    async close() { closed++; }
  }
  const js = ts.transpileModule(readFileSync("lib/database/mongo-index-client.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} as { createMongoIndexClient: () => Promise<{ $runCommandRaw: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>; $disconnect: () => Promise<void> }> } };
  new vm.Script(js).runInNewContext({ module: mod, exports: mod.exports, process: { env: { DATABASE_URL: "mongodb://fixture.invalid/db" } }, require: (id: string) => { assert.equal(id, "mongodb"); return { MongoClient }; } });
  const db = await mod.exports.createMongoIndexClient();
  assert.equal(await ensureOptionalUserEmailIndex(db, true), true);
  assert.equal(connected, 1); await db.$disconnect(); assert.equal(closed, 1);
  assert.deepEqual(indexes[0].partialFilterExpression, { email: { $type: "string" } });
});
