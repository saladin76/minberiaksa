/** Read-only diagnosis: no messages, retries, cron requests, provider calls or database writes.
 * Run on the VPS from the project directory:
 * node --import tsx scripts/audit-communication-runtime.mjs
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function classifyFailure(value) {
  const text = String(value ?? "");
  if (text.includes("WHATSAPP_OPT_IN_REQUIRED")) return "RETIRED_INTERNAL_OPT_IN_GUARD";
  if (/healthy ecosystem engagement|131049/i.test(text)) return "META_ECOSYSTEM_LIMIT";
  if (/undeliverable|131026/i.test(text)) return "META_UNDELIVERABLE";
  if (/DO_NOT_CONTACT|UNSUBSCRIBED|CONSENT_BLOCKED/i.test(text)) return "RECIPIENT_STOP_OR_DO_NOT_CONTACT";
  if (/COOLDOWN|RECENT_MARKETING_CONTACT/i.test(text)) return "MARKETING_INTERVAL";
  if (/TEMPLATE|PARAMETER/i.test(text)) return "TEMPLATE_OR_PARAMETER";
  if (/SENDER|ROUTING|WABA/i.test(text)) return "SENDER_OR_ROUTING";
  return "OTHER";
}
function command(file, args) {
  try { return execFileSync(file, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch { return null; }
}
function runtimeEvidence(cwd) {
  const pm2Pid = Number(command("pm2", ["pid", "minberiaksa"]));
  const port = /^\d{1,5}$/.test(process.env.PORT ?? "") ? process.env.PORT : "3000";
  const listeners = command("ss", ["-ltnp", "sport", "=", `:${port}`]);
  const pids = [...new Set([...(listeners ?? "").matchAll(/pid=(\d+)/g)].map(match => Number(match[1])))];
  const processes = pids.map(pid => {
    let activeCwd = null;
    try { activeCwd = readlinkSync(`/proc/${pid}/cwd`); } catch {}
    return { pid, isPm2Process: pid === pm2Pid, cwdMatchesRepository: activeCwd === cwd, startedAt: command("ps", ["-p", String(pid), "-o", "lstart="]) };
  });
  let build = null;
  try { const file = resolve(cwd, ".next/BUILD_ID"); build = { id: readFileSync(file, "utf8").trim(), modifiedAt: statSync(file).mtime.toISOString() }; } catch {}
  // Search code only, never .env, process environments, source maps or log bodies.
  let scannedFiles = 0, retiredGuardFiles = 0;
  function scan(dir) {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile() && file.endsWith(".js")) {
        scannedFiles++;
        if (readFileSync(file, "utf8").includes("WHATSAPP_OPT_IN_REQUIRED")) retiredGuardFiles++;
      }
    }
  }
  scan(resolve(cwd, ".next/server"));
  return { repositoryCommit: command("git", ["rev-parse", "HEAD"]), pm2Pid: pm2Pid || null, port, listenerProcesses: processes, build, builtServerFilesScanned: scannedFiles, retiredGuardFiles, note: "A matching repository commit alone does not identify the code already loaded by the listener. No process environment or arguments were printed." };
}
async function main() {
  const cwd = process.cwd();
  const require = createRequire(resolve(cwd, "package.json"));
  require("@next/env").loadEnvConfig(cwd, false, { info() {}, error() {} });
  const prismaModule = await import(pathToFileURL(resolve(cwd, "lib/prisma.ts")).href);
  const { prisma } = prismaModule.default ?? prismaModule;
  const attributionModule = await import(pathToFileURL(resolve(cwd, "lib/communication/campaign-attribution-service.ts")).href);
  const { getCampaignOutcomeSummary } = attributionModule.default ?? attributionModule;
  const report = { checkedAt: new Date().toISOString(), readOnly: true, environmentSource: "CLI and Next production env files; PM2/listener environment is not read", databaseWrites: 0, providerCalls: 0, messagesSent: 0, cronRequests: 0, runtime: runtimeEvidence(cwd) };
  try {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const reasons = {}; let cursor;
    for (;;) {
      const rows = await prisma.communicationDelivery.findMany({ where: { channel: "WHATSAPP", createdAt: { gte: since }, status: { in: ["FAILED", "SKIPPED", "BOUNCED"] }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: { id: true, errorMessage: true, createdAt: true }, orderBy: { id: "asc" }, take: 1000 });
      for (const row of rows) { const reason = classifyFailure(row.errorMessage); const group = reasons[reason] ??= { count: 0, latestAt: null }; group.count++; if (!group.latestAt || row.createdAt.toISOString() > group.latestAt) group.latestAt = row.createdAt.toISOString(); }
      if (rows.length < 1000) break;
      const next = rows.at(-1)?.id; if (!next || next === cursor) throw new Error("CURSOR_STALLED"); cursor = next;
    }
    report.whatsappFailuresLast24Hours = reasons;
    const campaigns = await prisma.communicationCampaign.findMany({ select: { id: true }, take: 10_000 });
    if (campaigns.length >= 10_000) throw new Error("CAMPAIGN_SCAN_INCOMPLETE");
    const outcomes = await getCampaignOutcomeSummary(campaigns.map(campaign => campaign.id));
    report.campaignRevenue = { campaignCount: campaigns.length, campaignsWithConfirmedDonations: [...outcomes.metrics.values()].filter(row => row.donationCount > 0).length, attributed: [...outcomes.metrics.values()].reduce((out, row) => ({ donationCount: out.donationCount + row.donationCount, revenueUSD: Math.round((out.revenueUSD + row.revenue) * 100) / 100, unpricedPaidCount: out.unpricedPaidCount + row.unpricedPaidCount }), { donationCount: 0, revenueUSD: 0, unpricedPaidCount: 0 }), unattributed: outcomes.unattributed };
    report.notes = ["No donor identifiers, contacts, keys, tokens or message bodies are included.", "Shared historical UTMs are not assigned to a campaign by guesswork.", "META_ECOSYSTEM_LIMIT is a provider delivery rejection, separate from the retired internal opt-in guard."];
    console.log(JSON.stringify(report, null, 2));
  } catch {
    console.log(JSON.stringify({ ...report, dataStatus: "READ_FAILED_OR_INCOMPLETE", notes: ["Revenue is unavailable; a failed read is not zero income. No private error body was printed."] }, null, 2));
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
