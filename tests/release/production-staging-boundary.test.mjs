import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("no connected E2E can run on main via loosely-scoped secrets", () => {
  const workflow = readFileSync(".github/workflows/release-gates.yml", "utf8");
  const e2e = workflow.slice(workflow.indexOf("\n  e2e:\n"), workflow.indexOf("\n  fixture-build:\n"));
  assert.match(e2e, /if:\s*\$\{\{ false \}\}/);
  assert.doesNotMatch(e2e, /secrets\.(DATABASE_URL|E2E_BASE_URL)/);
  assert.doesNotMatch(e2e, /npm run test:e2e/);
});

test("production build rejects staging before any migration or compile", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const name of ["build", "build:vercel"]) {
    assert.ok(scripts[name].startsWith("node scripts/reject-staging-production-build.mjs && "),
      name + " must deny staging before any work");
  }
  const blocked = spawnSync(process.execPath, ["scripts/reject-staging-production-build.mjs"], {
    env: { MINBER_RUNTIME_ROLE: "staging", STAGING_BUILD_APPROVED: "1" },
    encoding: "utf8",
  });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /PRODUCTION_BUILD_DENIED_IN_STAGING/);
  const permitted = spawnSync(process.execPath, ["scripts/reject-staging-production-build.mjs"], {
    env: { MINBER_RUNTIME_ROLE: "production" },
    encoding: "utf8",
  });
  assert.equal(permitted.status, 0);
});
