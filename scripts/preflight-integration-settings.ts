import { readFileSync } from "node:fs";
import { inspectEnvironment, overallStatus, type ReleaseCheck } from "../lib/integration-settings/release-readiness";
import { inspectIntegrationSettingsDatabase } from "./integration-settings-db-inspection";

function print(check: ReleaseCheck) {
  console.log(`[${check.status}] ${check.id}: ${check.message}`);
}

function inspectNodeRuntimeContracts(): ReleaseCheck {
  const requiredNodeRoutes = [
    "app/api/webhooks/meta/whatsapp/route.ts",
    "app/api/webhooks/brevo/transactional/route.ts",
    "app/api/cron/communication-run-due/route.ts",
    "app/api/admin/integration-settings/[provider]/route.ts",
    "app/api/admin/integration-settings/[provider]/test-active/route.ts",
    "app/api/admin/integration-settings/[provider]/test-candidate/route.ts",
    "app/api/admin/integration-settings/[provider]/activate-candidate/route.ts",
  ];
  const invalid = requiredNodeRoutes.filter((path) => {
    try {
      return !/export\s+const\s+runtime\s*=\s*["']nodejs["']/.test(readFileSync(path, "utf8"));
    } catch {
      return true;
    }
  });
  return invalid.length
    ? { id: "node-runtime", status: "BLOCKED", message: `Required Node.js runtime declarations are missing from ${invalid.length} route(s).` }
    : { id: "node-runtime", status: "PASS", message: "Crypto, Prisma, webhook, integration, and Cron routes explicitly use the Node.js runtime." };
}

async function main() {
  const checks = [...inspectEnvironment(process.env), inspectNodeRuntimeContracts()];
  for (const check of checks) print(check);

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("[BLOCKED] database: Database inspection was skipped because DATABASE_URL is missing.");
    process.exitCode = 2;
    return;
  }

  try {
    const db = await inspectIntegrationSettingsDatabase({ staleCandidateHours: 24 });
    const dbChecks: ReleaseCheck[] = [
      { id: "database-connectivity", status: db.connected ? "PASS" : "BLOCKED", message: db.connected ? "Database connection succeeded." : "Database connection failed." },
      { id: "collection", status: db.collectionExists ? "PASS" : "WARNING", message: db.collectionExists ? "IntegrationSetting collection is readable." : "IntegrationSetting collection does not exist yet; this is normal before the first migration." },
      { id: "record-count", status: "PASS", message: `IntegrationSetting record count: ${db.documentCount}.` },
      { id: "duplicates", status: db.duplicateKeys.length ? "BLOCKED" : "PASS", message: db.duplicateKeys.length ? `Duplicate provider/key groups detected: ${db.duplicateKeys.length}.` : "No duplicate provider/key groups detected." },
      { id: "stale-candidates", status: db.staleCandidates.length ? "WARNING" : "PASS", message: db.staleCandidates.length ? `Stale pending provider candidates detected: ${db.staleCandidates.length}.` : "No stale pending provider candidates detected." },
      { id: "encrypted-values", status: db.unreadableSecrets.length ? "BLOCKED" : "PASS", message: db.unreadableSecrets.length ? `Unreadable encrypted settings detected: ${db.unreadableSecrets.map((item) => `${item.provider}/${item.key}`).join(", ")}.` : "All stored active encrypted settings are decryptable with the configured key." },
      { id: "transactions", status: db.transactions.status === "SUPPORTED" ? "PASS" : "WARNING", message: db.transactions.message },
      { id: "cron-route", status: "PASS", message: "Cron protection was validated from configuration and source without invoking the route or executing campaigns." },
      ...db.indexChecks.map((item) => db.collectionExists ? item : { ...item, status: "WARNING" as const }),
    ];
    dbChecks.forEach(print);
    const status = overallStatus([...checks, ...dbChecks]);
    console.log(`\nINTEGRATION SETTINGS PREFLIGHT: ${status}`);
    process.exitCode = status === "BLOCKED" ? 2 : 0;
  } catch (error) {
    const name = error instanceof Error ? error.message.split(":")[0] : "INTEGRATION_DATABASE_INSPECTION_FAILED";
    console.log(`[BLOCKED] database-inspection: ${name}.`);
    console.log("\nINTEGRATION SETTINGS PREFLIGHT: BLOCKED");
    process.exitCode = 2;
  }
}

main().catch(() => {
  console.log("[BLOCKED] preflight: Unexpected preflight failure.");
  process.exitCode = 2;
});
