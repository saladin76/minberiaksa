// Run after a successful reviewed deployment. This configures provider
// metadata only: it never captures payments, runs billing, or messages donors.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkMetadataImports, metadataNodeExecutable, metadataNodeFlags } from "./release-metadata-runtime.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const apply = process.argv.includes("--apply");
const checkRuntime = process.argv.includes("--check-runtime");
const publish = process.argv.includes("--publish");
const activate = process.argv.includes("--activate-approved");
if ((publish || activate) && !apply) throw new Error("Publishing or activation requires --apply");
const steps = [
  { name: "paypal-webhook", script: "scripts/setup-paypal-webhook.mjs", args: [] },
  { name: "gift-templates", script: "scripts/prepare-gift-whatsapp.mjs", args: publish ? ["--publish"] : [] },
  { name: "notification-templates", script: "scripts/upgrade-notification-templates.mjs", args: [...(publish ? ["--publish"] : []), ...(activate ? ["--activate-approved"] : [])] },
  { name: "document-templates", script: "scripts/prepare-document-whatsapp.mjs", args: publish ? ["--publish"] : [] },
  { name: "retired-templates", script: "scripts/cleanup-retired-templates.mjs", args: [] },
  { name: "greeting-templates", script: "scripts/prepare-greeting-whatsapp.mjs", args: publish ? ["--publish"] : [] },
];
if (!apply && !checkRuntime) {
  console.log(JSON.stringify({ readOnly: true, steps: steps.map(step => step.name), providerCalls: 0, databaseWrites: 0, paymentCaptures: 0, recipientMessages: 0 }));
} else {
  const executable = metadataNodeExecutable(root);
  const check = checkMetadataImports(root, executable);
  if (check.status !== 0 || check.error) {
    console.error("Release metadata runtime check failed; no setup step was started.");
    if (check.stderr) console.error(check.stderr);
    if (check.error) console.error(check.error.message);
    process.exitCode = 1;
  } else if (!apply) {
    process.stdout.write(check.stdout);
  } else {
    process.stdout.write(check.stdout);
    const outcomes = [];
    for (const step of steps) {
      console.log(`\n[release metadata] ${step.name}`);
      const result = spawnSync(executable, [...metadataNodeFlags, step.script, "--apply", ...step.args], { cwd: root, env: process.env, stdio: "inherit" });
      outcomes.push({ step: step.name, ok: !result.error && result.status === 0, exitCode: result.status });
    }
    console.log(JSON.stringify({ outcomes, paymentCaptures: 0, recipientMessages: 0 }));
    if (outcomes.some(step => !step.ok)) process.exitCode = 1;
  }
}
