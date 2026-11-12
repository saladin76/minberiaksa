import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/dashboard-pr202-staging-acceptance.mjs");

function check(env: Record<string, string>) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STAGING_URL: "",
      STAGING_ADMIN_COOKIE: "",
      STAGING_REVENUE_STAFF_COOKIE: "",
      STAGING_DENIED_STAFF_COOKIE: "",
      STAGING_DONOR_COOKIE: "",
      ...env,
    },
    encoding: "utf8",
    timeout: 10000,
  });
}

test("acceptance script fails closed without isolated staging URL", () => {
  const r = check({ STAGING_ADMIN_COOKIE: "secret-for-test" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Missing STAGING_URL/);
  assert.doesNotMatch(r.stdout + r.stderr, /secret-for-test/);
});

test("acceptance script rejects production hostname before touching any endpoint", () => {
  const r = check({ STAGING_URL: "https://minberiaksa.org", STAGING_ADMIN_COOKIE: "secret-for-test" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Refusing production Minber hostname/);
  assert.doesNotMatch(r.stdout + r.stderr, /secret-for-test/);
});

test("acceptance script cannot silently omit revenue, denied staff or donor role", () => {
  const r = check({ STAGING_URL: "https://staging.example.org", STAGING_ADMIN_COOKIE: "admin-test-secret" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Missing isolated staging cookies for roles/);
  assert.match(r.stderr, /REVENUE_STAFF/);
  assert.match(r.stderr, /DENIED_STAFF/);
  assert.match(r.stderr, /DONOR/);
  assert.doesNotMatch(r.stdout + r.stderr, /admin-test-secret/);
});
