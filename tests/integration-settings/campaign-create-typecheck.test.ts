import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const configPath = "tsconfig.campaign-create.json";

test("campaign create targeted TypeScript check passes", () => {
  assert.doesNotThrow(() => {
    execFileSync(
      process.execPath,
      ["node_modules/typescript/bin/tsc", "-p", configPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      },
    );
  });
});

test("campaign create targeted TypeScript scope includes the real Prisma adapter and core", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    include?: string[];
  };

  assert.ok(Array.isArray(config.include));
  assert.ok(config.include.includes("lib/campaign/admin-create.ts"));
  assert.ok(config.include.includes("lib/campaign/admin-create-core.ts"));
});
