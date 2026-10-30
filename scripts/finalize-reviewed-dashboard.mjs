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
const allSteps = [
  { name: "paypal-webhook", script: "scripts/setup-paypal-webhook.mjs", args: [] },
  { name: "gift-templates", script: "scripts/prepare-gift-whatsapp.mjs", args: publish ? ["--publish"] : [] },
  { name: "notification-templates", script: "scripts/upgrade-notification-templates.mjs", args: [...(publish ? ["--publish"] : []), ...(activate ? ["--activate-approved"] : [])] },
  { name: "document-templates", script: "scripts/prepare-document-whatsapp.mjs", args: publish ? ["--publish"] : [] },
  { name: "retired-templates", script: "scripts/cleanup-retired-templates.mjs", args: [] },
  { name: "greeting-templates", script: "scripts/prepare-greeting-whatsapp.mjs", args: publish ? ["--publish"] : [] },
];
const stepOptions = process.argv.slice(2).filter(arg => arg.startsWith("--steps="));
if (stepOptions.length > 1 || process.argv.slice(2).some(arg => !["--apply", "--check-runtime", "--publish", "--activate-approved"].includes(arg) && !arg.startsWith("--steps="))) throw new Error("Unknown or duplicate metadata option");
const selected = stepOptions.length ? stepOptions[0].slice("--steps=".length).split(",") : null;
if (selected && (new Set(selected).size !== selected.length || selected.some(name => !allSteps.some(step => step.name === name)))) throw new Error("Unknown or duplicate metadata step; no setup was started");
const steps = allSteps.filter(step => !selected || selected.includes(step.name));
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
