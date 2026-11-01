/** Defaults to a read-only preview. --execute requires its exact run ID and cap. */
import { loadEnvConfig } from "@next/env";
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { runRecurringRehearsal } from "../lib/donations/recurring-rehearsal";
import { prisma } from "../lib/prisma";
loadEnvConfig(process.cwd(), false);

async function main() {
  const args = process.argv.slice(2), values: Record<string, string> = {};
  const names = ["subscription", "donor", "currency", "max-total", "cycles", "interval-seconds", "run-id"];
  const flags = new Set<string>();
  for (const arg of args) {
    if (["--execute", "--detach"].includes(arg)) { if (flags.has(arg)) throw new Error("DUPLICATE_ARGUMENT"); flags.add(arg); continue; }
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match || !names.includes(match[1]) || values[match[1]]) throw new Error("INVALID_ARGUMENT");
    values[match[1]] = match[2];
  }
  if (flags.has("--detach") && !flags.has("--execute")) throw new Error("DETACH_REQUIRES_EXECUTE");
  try {
    const options = { subscriptionId: values.subscription || "", donorId: values.donor || "", currency: values.currency || "", maxTotal: values["max-total"] || "", cycles: values.cycles ? Number(values.cycles) : 3, intervalSeconds: values["interval-seconds"] ? Number(values["interval-seconds"]) : 60, runId: values["run-id"], execute: flags.has("--execute") };
    if (options.execute && !options.runId) throw new Error("PREVIEW_RUN_ID_REQUIRED");
    if (flags.has("--detach")) {
      const preview = await runRecurringRehearsal({ ...options, execute: false });
      if (preview.state !== "PREVIEW") { console.log(JSON.stringify(preview, null, 2)); return; }
      const folder = resolve(process.env.RECURRING_REHEARSAL_LOG_DIR || "../minberi-recurring-rehearsals", options.runId!);
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const log = resolve(folder, "run.log"), output = openSync(log, "a", 0o600);
      try {
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...args.filter(arg => arg !== "--detach")], { cwd: process.cwd(), env: process.env, detached: true, stdio: ["ignore", output, output] });
        await new Promise<void>((accept, reject) => { child.once("spawn", accept); child.once("error", reject); });
        child.unref();
        console.log(JSON.stringify({ state: "STARTED", runId: options.runId, pid: child.pid, log, note: "This is not proof of collection. The log records the final bank-confirmed result." }, null, 2));
      } finally { closeSync(output); }
    } else {
      const result = await runRecurringRehearsal(options);
      console.log(JSON.stringify(result, null, 2));
      if (["STOPPED", "REVIEW_REQUIRED"].includes(result.state)) process.exitCode = 1;
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "REHEARSAL_FAILED_REVIEW_RUN_LOCK"; console.error(JSON.stringify({ error: code, automaticRetry: false })); process.exitCode = 1; });
