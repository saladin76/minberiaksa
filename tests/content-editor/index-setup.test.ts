import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function runSetup(
  args: string[],
  env: Record<string, string> = {},
  options: { conflictingIndex?: boolean; duplicateValues?: boolean } = {},
) {
  const commands: Array<Record<string, unknown>> = [];
  const messages: string[] = [];
  let clients = 0;
  let disconnects = 0;
  const scriptProcess = {
    argv: ["node", "ensure-content-editor-indexes.ts", ...args],
    env,
    cwd: () => process.cwd(),
    exitCode: undefined as number | undefined,
  };
  class Client {
    constructor() { clients += 1; }
    async $runCommandRaw(command: Record<string, unknown>) {
      commands.push(command);
      if ("listCollections" in command) {
        return { cursor: { firstBatch: options.conflictingIndex ? [{ name: "CampaignSlugRedirect" }] : [] } };
      }
      if ("listIndexes" in command) {
        return { cursor: { firstBatch: [{ key: { locale: 1, slug: 1 }, unique: false }] } };
      }
      if ("createIndexes" in command) {
        if (options.duplicateValues) throw new Error("E11000 duplicate values prevent unique index creation");
        return { ok: 1 };
      }
      throw new Error("Unexpected database command");
    }
    async $disconnect() { disconnects += 1; }
  }
  const source = readFileSync("scripts/ensure-content-editor-indexes.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await runInNewContext(output, {
    exports: {},
    Error,
    process: scriptProcess,
    console: {
      log: (message: unknown) => messages.push(String(message)),
      error: (message: unknown) => messages.push(String(message)),
    },
    require: (name: string) => {
      if (name === "@next/env") return { loadEnvConfig() {} };
      if (name === "@prisma/client") return { PrismaClient: Client };
      throw new Error("Unexpected script dependency: " + name);
    },
  });
  return { commands, messages, clients, disconnects, exitCode: scriptProcess.exitCode };
}

test("explicit production index setup runs on the VPS without Vercel variables", async () => {
  const result = await runSetup(["--production"]);
  assert.equal(result.clients, 1);
  assert.equal(result.commands.filter((command) => "createIndexes" in command).length, 22);
  assert.equal(result.disconnects, 1);
  assert.equal(result.exitCode, undefined);
});

test("production index setup skips Vercel previews without opening the database", async () => {
  const result = await runSetup(["--production"], { VERCEL: "1", VERCEL_ENV: "preview" });
  assert.equal(result.clients, 0);
  assert.equal(result.commands.length, 0);
  assert.match(result.messages.join("\n"), /production-only step skipped/);
});

test("production index setup still runs on Vercel production", async () => {
  const result = await runSetup(["--production"], { VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(result.commands.filter((command) => "createIndexes" in command).length, 22);
  assert.equal(result.disconnects, 1);
});

test("index setup defaults to a dry run without opening the database", async () => {
  const result = await runSetup([]);
  assert.equal(result.clients, 0);
  assert.equal(result.commands.length, 0);
  assert.match(result.messages.join("\n"), /"dryRun": true/);
});

test("index verification reports missing indexes without creating them", async () => {
  const result = await runSetup(["--check"]);
  assert.equal(result.commands.filter((command) => "createIndexes" in command).length, 0);
  assert.equal(result.exitCode, 1);
  assert.equal(result.disconnects, 1);
});

test("index setup stops at conflicting indexes without removing data or indexes", async () => {
  const result = await runSetup(["--production"], {}, { conflictingIndex: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.commands.filter((command) => "createIndexes" in command).length, 0);
  assert.ok(result.commands.every((command) => "listCollections" in command || "listIndexes" in command));
  assert.match(result.messages.join("\n"), /Non-unique index already exists/);
  assert.equal(result.disconnects, 1);
});

test("duplicate values fail production index setup and leave existing data intact", async () => {
  const result = await runSetup(["--production"], {}, { duplicateValues: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.commands.length, 2);
  assert.match(result.messages.join("\n"), /E11000/);
  assert.equal(result.disconnects, 1);
});
