import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXPECTED_INTEGRATION_SETTING_INDEXES, inspectEnvironment, inspectIndexDefinitions, overallStatus } from "../../lib/integration-settings/release-readiness";

const validKey = Buffer.alloc(32, 7).toString("base64url");

type EnvOverrides = Partial<NodeJS.ProcessEnv>;

function safeEnv(overrides: EnvOverrides = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "mongodb://example.invalid/test",
    INTEGRATION_SETTINGS_ENCRYPTION_KEY: validKey,
    CRON_SECRET: "x".repeat(32),
    NEXTAUTH_URL: "https://example.org",
    NODE_ENV: "production",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

test("production environment readiness passes with safe required values", () => {
  const checks = inspectEnvironment(safeEnv());
  assert.equal(overallStatus(checks), "PASS");
  assert.equal(checks.some((check) => check.message.includes(validKey)), false);
});

test("invalid encryption key, http production URL, and legacy flags block release", () => {
  const checks = inspectEnvironment(safeEnv({
    INTEGRATION_SETTINGS_ENCRYPTION_KEY: "invalid",
    NEXTAUTH_URL: "http://example.org",
    WHATSAPP_LEGACY_TWILIO_ENABLED: "true",
    SENDGRID_FALLBACK_ENABLED: "true",
  }));
  assert.equal(overallStatus(checks), "BLOCKED");
  assert.equal(checks.filter((check) => check.status === "BLOCKED").length >= 4, true);
});

test("canonical URL conflicts are warnings without exposing URL values", () => {
  const checks = inspectEnvironment(safeEnv({ APP_URL: "https://app.example.org", NEXTAUTH_URL: "https://auth.example.org" }));
  const conflict = checks.find((check) => check.id === "canonical-url-conflict");
  assert.equal(conflict?.status, "WARNING");
  assert.equal(conflict?.message.includes("app.example.org"), false);
});

test("required migration indexes match expected names and definitions", () => {
  const checks = inspectIndexDefinitions(EXPECTED_INTEGRATION_SETTING_INDEXES.map((index) => ({ ...index, key: { ...index.key } })));
  assert.equal(overallStatus(checks), "PASS");
});

test("conflicting unique index definition blocks migration verification", () => {
  const actual = EXPECTED_INTEGRATION_SETTING_INDEXES.map((index) => ({ ...index, key: { ...index.key } }));
  actual[0] = { ...actual[0], unique: false };
  assert.equal(overallStatus(inspectIndexDefinitions(actual)), "BLOCKED");
});

test("preflight and migration verification are read-only and provider-free", () => {
  const preflight = readFileSync("scripts/preflight-integration-settings.ts", "utf8");
  const verify = readFileSync("scripts/verify-integration-settings-migration.ts", "utf8");
  const inspection = readFileSync("scripts/integration-settings-db-inspection.ts", "utf8");
  const combined = `${preflight}\n${verify}\n${inspection}`;
  for (const forbidden of ["createIndexes", ".create(", ".update(", ".delete(", "fetch(", "axios", "sendTemplate", "sendEmail", "sendSms"]) {
    assert.equal(combined.includes(forbidden), false, `read-only release tools must not contain ${forbidden}`);
  }
  assert.doesNotMatch(combined, /console\.(log|error)\([^\n]*(encryptedValue|INTEGRATION_SETTINGS_ENCRYPTION_KEY|CRON_SECRET|API_KEY|PASSWORD|ACCESS_TOKEN)/);
});

test("crypto Prisma webhook integration and Cron routes explicitly use Node runtime", () => {
  const routes = [
    "app/api/webhooks/meta/whatsapp/route.ts",
    "app/api/webhooks/brevo/transactional/route.ts",
    "app/api/cron/communication-run-due/route.ts",
    "app/api/admin/integration-settings/[provider]/route.ts",
    "app/api/admin/integration-settings/[provider]/test-active/route.ts",
    "app/api/admin/integration-settings/[provider]/test-candidate/route.ts",
    "app/api/admin/integration-settings/[provider]/activate-candidate/route.ts",
  ];
  for (const route of routes) {
    assert.match(readFileSync(route, "utf8"), /export\s+const\s+runtime\s*=\s*["']nodejs["']/i, `${route} must use Node.js runtime`);
  }
});

test("migration fails on duplicates and never deletes data or indexes", () => {
  const migration = readFileSync("prisma/mongodb-migrations/20260714-integration-settings.ts", "utf8");
  assert.match(migration, /DUPLICATE_PROVIDER_KEY/);
  assert.match(migration, /createIndexes/);
  assert.doesNotMatch(migration, /dropIndexes|dropIndex|deleteMany|deleteOne|dropDatabase|drop:/);
});
