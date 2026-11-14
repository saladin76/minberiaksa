import { rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const integrationTests = [
  "albaraka-checkout-flow",
  "albaraka-recurring",
  "meta-paid-events",
  "payment-routing-server",
  "paypal-webhook-settlement",
  "pending-confirmation-polling",
  "recurring-billing-safety",
  "recurring-lifecycle",
  "recurring-schedule",
  "stripe-polling-race",
  "verified-success-page",
].map((name) => `.integration-test-build/tests/integration-settings/${name}.test.js`);
const contentTests = [
  "account-summary-payment-safety",
  "mixed-cart-checkout",
  "mixed-checkout-verification-mode",
  "profile-donation-stats",
  "profile-sidebar-stats",
  "renewal-evidence",
  "subscription-lifecycle",
].map((name) => `tests/content-editor/${name}.test.ts`);

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["scripts/ensure-integration-test-client.mjs"]);
rmSync(path.join(root, ".integration-test-build"), { recursive: true, force: true });
run(["node_modules/typescript/bin/tsc", "-p", "tsconfig.integration-tests.json"]);
run(["--test", ...integrationTests]);
run(["--import", "tsx", "--test", ...contentTests]);
