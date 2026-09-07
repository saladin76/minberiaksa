import { EXPECTED_INTEGRATION_SETTING_INDEXES, overallStatus, type ReleaseCheck } from "../lib/integration-settings/release-readiness";
import { inspectIntegrationSettingsDatabase } from "./integration-settings-db-inspection";

function print(check: ReleaseCheck) {
  console.log(`[${check.status}] ${check.id}: ${check.message}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("[BLOCKED] database-url: DATABASE_URL is missing.");
    console.log("\nMIGRATION STATUS: NOT_APPLIED");
    process.exitCode = 2;
    return;
  }
  try {
    const db = await inspectIntegrationSettingsDatabase();
    if (!db.collectionExists) {
      console.log("[WARNING] collection: IntegrationSetting collection does not exist.");
      console.log("\nMIGRATION STATUS: NOT_APPLIED");
      process.exitCode = 0;
      return;
    }
    const checks: ReleaseCheck[] = [
      { id: "collection", status: "PASS", message: "IntegrationSetting collection exists." },
      { id: "duplicates", status: db.duplicateKeys.length ? "BLOCKED" : "PASS", message: db.duplicateKeys.length ? `Duplicate provider/key groups prevent the unique index: ${db.duplicateKeys.length}.` : "No duplicate provider/key groups detected." },
      ...db.indexChecks,
    ];
    checks.forEach(print);
    const presentExpected = EXPECTED_INTEGRATION_SETTING_INDEXES.filter((expected) => db.indexes.some((actual) => actual.name === expected.name)).length;
    const status = overallStatus(checks);
    const migrationState = status === "PASS" && presentExpected === EXPECTED_INTEGRATION_SETTING_INDEXES.length ? "FULLY_APPLIED" : presentExpected === 0 ? "NOT_APPLIED" : "PARTIALLY_APPLIED";
    console.log(`\nMIGRATION STATUS: ${migrationState}`);
    process.exitCode = status === "BLOCKED" ? 2 : 0;
  } catch (error) {
    const name = error instanceof Error ? error.message.split(":")[0] : "INTEGRATION_DATABASE_INSPECTION_FAILED";
    console.log(`[BLOCKED] migration-verification: ${name}.`);
    console.log("\nMIGRATION STATUS: UNKNOWN");
    process.exitCode = 2;
  }
}

main().catch(() => {
  console.log("[BLOCKED] migration-verification: Unexpected verification failure.");
  process.exitCode = 2;
});
