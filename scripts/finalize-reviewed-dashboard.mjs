// Run after a successful reviewed deployment. This configures provider
// metadata only: it never captures payments, runs billing, or messages donors.
import { spawnSync } from "node:child_process";
const apply = process.argv.includes("--apply");
const publish = process.argv.includes("--publish");
const activate = process.argv.includes("--activate-approved");
if ((publish || activate) && !apply) throw new Error("Publishing or activation requires --apply");
const steps = [
  { name: "paypal-webhook", script: "scripts/setup-paypal-webhook.mjs", args: [] },
  { name: "gift-templates", script: "scripts/prepare-gift-whatsapp.mjs", args: publish ? ["--publish"] : [] },
  { name: "notification-templates", script: "scripts/upgrade-notification-templates.mjs", args: [...(publish ? ["--publish"] : []), ...(activate ? ["--activate-approved"] : [])] },
  { name: "document-templates", script: "scripts/prepare-document-whatsapp.mjs", args: publish ? ["--publish"] : [] },
];
if (!apply) {
  console.log(JSON.stringify({ readOnly: true, steps: steps.map(step => step.name), providerCalls: 0, databaseWrites: 0, paymentCaptures: 0, recipientMessages: 0 }));
} else {
  const outcomes = [];
  for (const step of steps) {
    console.log(`\n[release metadata] ${step.name}`);
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", step.script, "--apply", ...step.args], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    outcomes.push({ step: step.name, ok: !result.error && result.status === 0, exitCode: result.status });
  }
  console.log(JSON.stringify({ outcomes, paymentCaptures: 0, recipientMessages: 0 }));
  if (outcomes.some(step => !step.ok)) process.exitCode = 1;
}
