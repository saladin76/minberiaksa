import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { bankDonationSelect } from "../../lib/donations/bank-operations-service";
test("default Prisma results omit financial staff notes and locks; the authorized service explicitly selects its ledger", () => {
  let options: { omit?: { donation?: Record<string, boolean> } } = {};
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync("lib/prisma.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new vm.Script(source).runInNewContext({ module: mod, exports: mod.exports, process: { env: { NODE_ENV: "production" } }, require: (name: string) => { assert.equal(name, "@prisma/client"); return { PrismaClient: class { constructor(value: typeof options) { options = value; } } }; } });
  assert.deepEqual(JSON.parse(JSON.stringify(options.omit?.donation)), { bankOperations: true, bankOperationLock: true, bankLastInquiry: true });
  assert.equal(bankDonationSelect.bankOperations, true); assert.equal(bankDonationSelect.bankOperationLock, true); assert.equal(bankDonationSelect.bankLastInquiry, true);
});
