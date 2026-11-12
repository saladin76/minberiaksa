import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CARD_AUDIT_METRICS,
  validateReadOnlyCardAuditTarget,
  runReadOnlyCardAudit,
} from "../../lib/security/read-only-card-audit";

const approved = {
  DATABASE_URL: "mongodb+srv://audit-reader:DO_NOT_USE@isolated.test/approved_staging?retryWrites=false",
  CARD_AUDIT_DATABASE: "approved_staging",
  CARD_AUDIT_CONFIRM: "READ_ONLY_COUNTS_APPROVED",
};

test("historical card audit rejects missing consent, missing DB, mismatched DB, and non-Mongo URLs", () => {
  for (const env of [
    {}, { ...approved, CARD_AUDIT_CONFIRM: "yes" },
    { ...approved, CARD_AUDIT_DATABASE: "production" },
    { ...approved, DATABASE_URL: "https://somewhere.test/approved_staging" },
    { ...approved, DATABASE_URL: "mongodb://host.test/another_staging" },
    { ...approved, DATABASE_URL: "mongodb://host.test/" },
  ]) {
    assert.throws(() => validateReadOnlyCardAuditTarget(env));
  }
  assert.doesNotThrow(() => validateReadOnlyCardAuditTarget(approved));
});

test("historical inspection issues ONLY named Mongo count commands; no card material is returned", async () => {
  const commands: Array<Record<string, unknown>> = [];
  const counts = await runReadOnlyCardAudit(async command => {
    commands.push(command as unknown as Record<string, unknown>);
    return { n: commands.length, ok: 1 };
  });
  assert.equal(commands.length, CARD_AUDIT_METRICS.length);
  assert.equal(Object.keys(counts).length, CARD_AUDIT_METRICS.length);
  for (const [index, command] of commands.entries()) {
    assert.deepEqual(Object.keys(command).sort(), ["count", "maxTimeMS", "query"]);
    assert.equal(command.count, CARD_AUDIT_METRICS[index].collection);
    assert.equal(command.maxTimeMS, 15000);
    assert.equal(counts[CARD_AUDIT_METRICS[index].key], index + 1);
    const query = command.query as Record<string, unknown>;
    assert.ok(Object.keys(query).length > 0);
    assert.doesNotMatch(JSON.stringify(command), /updateMany|findMany|delete|insert|aggregate/);
  }
  assert.doesNotMatch(JSON.stringify(counts), /DO_NOT_USE|cardNumber|cvv/);
});

test("historical inspection fails closed on malformed count responses", async () => {
  for (const response of [null, {}, { n: "3" }, { n: -1 }, { n: NaN }, { n: 1.3 }, { n: 2, data: "not-returned" }]) {
    if (response && typeof response === "object" && response.n === 2) continue;
    await assert.rejects(() => runReadOnlyCardAudit(async () => response));
  }
});

test("audit entrypoint does not run mutations, print connection details, or read sensitive document values", () => {
  const source = readFileSync("scripts/audit-legacy-card-fields.mjs", "utf8");
  assert.match(source, /validateReadOnlyCardAuditTarget\(process\.env\)/);
  assert.match(source, /runReadOnlyCardAudit\(command => prisma\.\$runCommandRaw\(command\)\)/);
  assert.doesNotMatch(source, /prisma\.(?:subscription|donation|creditCard)\.(?:findMany|findFirst|update|delete|create)/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:DATABASE_URL|cardNumber|cvv)/);
});
