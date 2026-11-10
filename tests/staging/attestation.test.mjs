import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvedStagingUrl, requiredRunnerConfiguration, verifyRemoteStaging, checkAttestation } from "../../scripts/staging-acceptance-preflight.mjs";

const sha = "a".repeat(40), digest = "b".repeat(64);
const base = "https://qa.minberiaksa.org/";
const safe = () => ({
  E2E_BASE_URL: base,
  STAGING_APPROVED_BASE_URL: base,
  STAGING_APPROVED_SHA: sha,
  GITHUB_SHA: sha,
  STAGING_APPROVED_INSTANCE_ID: "minber-staging-acceptance01",
  STAGING_APPROVED_DB_IDENTITY_SHA256: digest,
  STAGING_ATTESTATION_TOKEN: "synthetic-secret-not-a-real-token-xyz123456",
  E2E_STAFF_EMAIL: "qa@example.invalid",
  E2E_STAFF_PASSWORD: "synthetic-password",
});
const attestation = () => ({
  purpose: "staging-acceptance", environment: "staging",
  instanceId: "minber-staging-acceptance01", buildSha: sha,
  dbIdentitySha256: digest, dbRoleScope: "staging-database-only",
  safety: { cronDisabled: true, outboundMessagesDisabled: true, realPaymentCredentialsAbsent: true },
});
const denied = f => assert.throws(f, /STAGING_DENIED:/);

test("reviewed Staging configuration permits a verified identity without revealing credentials", async () => {
  assert.equal(approvedStagingUrl(base), base);
  const expected = requiredRunnerConfiguration(safe());
  assert.equal(checkAttestation(attestation(), expected), true);
  let seen = 0;
  const result = await verifyRemoteStaging(safe(), async (url, init) => {
    seen++;
    assert.equal(url, base + "api/internal/staging-attestation");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    return { status: 200, json: async () => attestation() };
  });
  assert.equal(seen, 1);
  assert.equal(result.ok, true);
});

test("production, localhost, Vercel, fake staging and protocol downgrades are rejected", () => {
  for (const url of [
    "https://minberiaksa.org", "https://www.minberiaksa.org",
    "http://qa.minberiaksa.org/", "https://minberiaksa.org:443/",
    "https://minberiaksa.vercel.app/", "http://127.0.0.1:3000/",
    "https://localhost/", "https://example.com/", "https://qa.example.com/receipt",
    "https://qa.example.com/?token=private", "https://user:pass@qa.minberiaksa.org/",
  ]) {
    if (url === "https://minberiaksa.org:443/") continue; // normalized to the forbidden hostname anyway
    denied(() => approvedStagingUrl(url));
  }
  denied(() => approvedStagingUrl("https://minberiaksa.org:443/"));
});

test("database-url-only and missing approvals do not authorize Playwright", () => {
  denied(() => requiredRunnerConfiguration({ DATABASE_URL: "mongodb://secret@localhost/prod" }));
  denied(() => requiredRunnerConfiguration({ ...safe(), DATABASE_URL: "mongodb://synthetic@localhost/test" }));
  denied(() => requiredRunnerConfiguration({ ...safe(), E2E_BASE_URL: "https://minberiaksa.org/" }));
  denied(() => requiredRunnerConfiguration({ ...safe(), STAGING_APPROVED_BASE_URL: "https://staging.elsewhere.org/" }));
  denied(() => requiredRunnerConfiguration({ ...safe(), GITHUB_SHA: "c".repeat(40) }));
  denied(() => requiredRunnerConfiguration({ ...safe(), STAGING_APPROVED_DB_IDENTITY_SHA256: "" }));
  denied(() => requiredRunnerConfiguration({ ...safe(), STAGING_ATTESTATION_TOKEN: "short" }));
});

test("remote attestation fails closed on unauthorized/redirect/malformed/mismatched identity", async () => {
  await assert.rejects(() => verifyRemoteStaging(safe(), async () => ({ status: 403 })), /STAGING_DENIED:/);
  await assert.rejects(() => verifyRemoteStaging(safe(), async () => { throw new Error("network error"); }), /STAGING_DENIED:/);
  await assert.rejects(() => verifyRemoteStaging(safe(), async () => ({ status: 200, json: async () => ({ ...attestation(), buildSha: "c".repeat(40) }) })), /STAGING_DENIED:/);
  denied(() => checkAttestation({ ...attestation(), safety: { ...attestation().safety, cronDisabled: false } }, requiredRunnerConfiguration(safe())));
});

test("full workflow is manual, reviewed and independent of runner database secrets", () => {
  const workflow = readFileSync(".github/workflows/release-gates.yml", "utf8");
  const critical = workflow.slice(workflow.indexOf("  e2e:\n"), workflow.indexOf("  fixture-build:\n"));
  assert.match(critical, /github\.event_name == 'workflow_dispatch'/);
  assert.match(critical, /inputs\.run_staging_e2e == 'APPROVED_STAGING_ONLY'/);
  assert.match(critical, /environment:\s*\n\s*name: staging-acceptance/);
  assert.match(critical, /node scripts\/staging-acceptance-preflight\.mjs/);
  assert.doesNotMatch(critical, /secrets\.DATABASE_URL/);
  assert.doesNotMatch(critical, /github\.ref == 'refs\/heads\/main'/);
  const config = readFileSync("playwright.config.ts", "utf8");
  assert.match(config, /E2E_STAGING_PREFLIGHT_REQUIRED/);
  assert.match(config, /webServer: undefined/);
});

test("mutating WhatsApp tests use fixtures; generic E2E blocks external HTTP and writes", () => {
  const triggers = readFileSync("e2e/trigger-readiness.spec.ts", "utf8");
  const sync = readFileSync("e2e/whatsapp-campaign-preflight.spec.ts", "utf8");
  const guard = readFileSync("e2e/support/fixtures.ts", "utf8");
  assert.match(triggers, /page\.route\("\*\*\/api\/templates\/triggers"/);
  assert.match(sync, /page\.route\("\*\*\/api\/dashboard\/communication\/whatsapp\/templates\/sync"/);
  assert.match(guard, /target\.origin !== baseUrl\.origin/);
  assert.match(guard, /route\.abort\("blockedbyclient"\)/);
  for (const file of ["e2e/trigger-readiness.spec.ts", "e2e/whatsapp-campaign-preflight.spec.ts", "e2e/donation-checkout.spec.ts"]) {
    assert.match(readFileSync(file, "utf8"), /from "\.\/support\/fixtures"/);
  }
});

test("staging build excludes indexes while production build remains unchanged", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts["build:staging"], /staging-build-preflight\.ts/);
  assert.doesNotMatch(scripts["build:staging"], /ensure-content-editor-indexes/);
  assert.match(scripts.build, /ensure-content-editor-indexes\.ts --production/);
  const indexes = readFileSync("scripts/ensure-content-editor-indexes.ts", "utf8");
  assert.match(indexes, /STAGING_INDEX_CHANGE_NOT_APPROVED/);
  assert.match(indexes, /verifyStagingDatabase/);
  const cron = readFileSync("lib/communication/cron-auth.ts", "utf8");
  assert.match(cron, /MINBER_RUNTIME_ROLE === "staging"/);
});

test("production build guard rejects staging before running Prisma or index steps", async () => {
  const { spawnSync } = await import("node:child_process");
  const blocked = spawnSync(process.execPath, ["scripts/reject-staging-production-build.mjs"], {
    env: { ...process.env, MINBER_RUNTIME_ROLE: "staging", STAGING_BUILD_APPROVED: "1" },
    encoding: "utf8",
  });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /PRODUCTION_BUILD_DENIED_IN_STAGING/);
  const normal = spawnSync(process.execPath, ["scripts/reject-staging-production-build.mjs"], {
    env: { PATH: process.env.PATH, MINBER_RUNTIME_ROLE: "production" },
    encoding: "utf8",
  });
  assert.equal(normal.status, 0);
});

test("staging build rejects absent approval before any Prisma connection or index work", async () => {
  const { spawnSync } = await import("node:child_process");
  const noApproval = spawnSync(process.execPath, ["--import", "tsx", "scripts/staging-build-preflight.ts"], {
    env: { PATH: process.env.PATH, NODE_ENV: "test", MINBER_RUNTIME_ROLE: "staging", STAGING_BUILD_APPROVED: "0" },
    encoding: "utf8",
    timeout: 12000,
  });
  assert.equal(noApproval.status, 1);
  assert.match(noApproval.stderr, /STAGING_BUILD_DENIED/);
  assert.doesNotMatch(noApproval.stdout + noApproval.stderr, /mongodb:\/\/|@cluster|secret/i);
});
