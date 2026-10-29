// Default: read-only plan. --apply --publish submits templates, never donor messages.
import { createRequire } from "node:module";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd(), false);
const apply = process.argv.includes("--apply"), publish = process.argv.includes("--publish");
const activate = process.argv.includes("--activate-approved");
if ((publish || activate) && !apply) throw new Error("Publishing/activation requires --apply");
const { prisma } = await import("../lib/prisma.ts");
try {
  const { prepareNotificationUpgrades, activateApprovedNotificationUpgrades } = await import("../lib/communication/notification-template-upgrade-service.ts");
  const plan = await prepareNotificationUpgrades({ apply, publish });
  console.log(JSON.stringify(plan, null, 2));
  if (activate) console.log(JSON.stringify(await activateApprovedNotificationUpgrades(), null, 2));
  if (plan.results.some(row => ["REVIEW_REQUIRED", "PUBLISH_FAILED"].includes(row.state))) process.exitCode = 1;
} finally { await prisma.$disconnect(); }
