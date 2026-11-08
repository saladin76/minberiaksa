#!/usr/bin/env node
/**
 * Read-only post-deployment production audit. Safe to run on Radore:
 *   node scripts/audit-post-deploy-readonly.mjs
 *
 * Reads only aggregate data. No payment captures, provider calls, cron requests,
 * campaign sends, writes, mutations, reconciliation, raw logs or credentials.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const cwd = process.cwd();
const require = createRequire(resolve(cwd, "package.json"));
require("@next/env").loadEnvConfig(cwd, false, { info() {}, error() {} });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const windows = [24, 72].map(hours => ({ hours, since: new Date(Date.now() - hours * 3_600_000) }));
const out = {
  checkedAt: new Date().toISOString(), readOnly: true, databaseWrites: 0,
  paymentProviderRequests: 0, paymentCaptures: 0, cronRequests: 0,
  communicationProviderRequests: 0, messagesSent: 0,
};
const clean = v => String(v == null ? "UNKNOWN" : v).replace(/[^A-Z0-9_-]/gi, "").slice(0, 42) || "UNKNOWN";
function grouped(rows, names) {
  return rows.map(row => ({
    ...Object.fromEntries(names.map(name => [name, clean(row[name])])),
    count: row._count?._all ?? row._count?.id ?? 0,
  })).sort((a,b) => b.count - a.count);
}
function summariseCron(log) {
  const cutoff = Date.now() - 24 * 3_600_000;
  const aggregate = {};
  for (const line of log.split("\n")) {
    const m = /^(\S+)\s+(\/api\/cron\/[a-z0-9-]+)\s+HTTP\s+(\d{3})\b/.exec(line);
    if (!m) continue;
    const at = Date.parse(m[1]);
    if (!Number.isFinite(at) || at < cutoff) continue;
    const route = m[2], status = m[3];
    const item = aggregate[route] ??= { attempts: 0, ok: 0, errors: 0, lastStatus: "", lastAt: "" };
    item.attempts++;
    status.startsWith("2") ? item.ok++ : item.errors++;
    if (!item.lastAt || at > Date.parse(item.lastAt)) { item.lastAt = new Date(at).toISOString(); item.lastStatus = status; }
  }
  return aggregate;
}
async function section(name, fn) {
  try { out[name] = await fn(); }
  catch { out[name] = { status: "READ_FAILED_OR_UNAVAILABLE" }; out.incomplete = true; }
}
try {
  await section("deployment", async () => {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", timeout: 4000 }).trim();
    const list = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8", timeout: 5000 }));
    const app = list.find(a => a.name === "minberiaksa");
    return { gitSha: sha, pm2: app ? {
      online: app.pm2_env.status === "online",
      restartsTotal: app.pm2_env.restart_time ?? null,
      unstableRestarts: app.pm2_env.unstable_restarts ?? null,
      uptimeMinutes: Math.floor((Date.now() - app.pm2_env.pm_uptime) / 60000),
    } : { status: "APP_NOT_FOUND" } };
  });
  for (const window of windows) {
    await section("donations" + window.hours + "h", async () => {
      const [byProvider, byStatus, recurring] = await Promise.all([
        prisma.donation.groupBy({
          by: ["provider", "status"], where: { createdAt: { gte: window.since } },
          _count: { _all: true },
        }),
        prisma.donation.groupBy({
          by: ["status"], where: { createdAt: { gte: window.since } },
          _count: { _all: true },
        }),
        prisma.donation.groupBy({
          by: ["billingReason", "status"],
          where: { createdAt: { gte: window.since }, OR: [
            { billingReason: "subscription_cycle" }, { providerTxnType: "RecurringSale" },
          ] }, _count: { _all: true },
        }),
      ]);
      const [confirmed, awaiting] = await Promise.all([
        prisma.donation.count({ where: { createdAt: { gte: window.since }, paidAt: { not: null } } }),
        prisma.donation.count({ where: { createdAt: { gte: window.since }, paidAt: null, status: { not: "FAILED" } } }),
      ]);
      return {
        byProviderStatus: grouped(byProvider, ["provider","status"]),
        byStatus: grouped(byStatus, ["status"]),
        recurringAttempts: grouped(recurring, ["billingReason","status"]),
        confirmedByPaidAt: confirmed,
        unconfirmedNonFailed: awaiting,
      };
    });
    await section("delivery" + window.hours + "h", async () => {
      const [states, types] = await Promise.all([
        prisma.communicationDelivery.groupBy({
          by: ["channel", "status"], where: { createdAt: { gte: window.since } },
          _count: { _all: true },
        }),
        prisma.communicationDelivery.groupBy({
          by: ["channel", "purpose"], where: { createdAt: { gte: window.since } },
          _count: { _all: true },
        }),
      ]);
      return { byChannelStatus: grouped(states, ["channel","status"]), byChannelPurpose: grouped(types, ["channel","purpose"]) };
    });
  }
  await section("subscriptions", async () => {
    const rows = await prisma.subscription.groupBy({ by: ["provider","status"], _count: { _all: true } });
    const cadence = await prisma.subscription.groupBy({ by: ["frequency","status"], _count: { _all: true } });
    return { byProviderStatus: grouped(rows, ["provider","status"]), byStoredFrequency: grouped(cadence, ["frequency","status"]) };
  });
  await section("content", async () => {
    const [campaigns, categories, posts, slides, banners, superCats, seo] = await Promise.all([
      prisma.campaign.count(), prisma.category.count(), prisma.post.count(),
      prisma.slide.count(), prisma.urgentBanner.count(), prisma.superCategory.count(),
      prisma.managedPageSeo.count(),
    ]);
    return { campaigns, categories, posts, slides, urgentBanners: banners, superCategories: superCats, managedSeoPages: seo,
      note: "Counts do not prove quality, 19-language completeness or saved editor functionality." };
  });
  await section("cron", async () => {
    let installed = [];
    try {
      const tab = execFileSync("crontab", ["-l"], { encoding: "utf8", timeout: 4000 });
      installed = [...new Set(tab.split("\n").filter(l => !l.startsWith("#")).flatMap(l =>
        l.match(/\/api\/cron\/[a-z0-9-]+/g) || []))].sort();
    } catch {}
    const logFile = "/var/log/minberiaksa-cron.log";
    const logs = existsSync(logFile) ? readFileSync(logFile, "utf8").slice(-5_300_000) : "";
    return {
      maintenanceHoldPresent: existsSync(resolve(cwd, ".cron-maintenance-hold")),
      installedRoutes: installed,
      last24Hours: summariseCron(logs),
      logAvailable: existsSync(logFile),
      note: "Successful HTTP responses do not prove financial settlement or delivery; logs are never printed.",
    };
  });
  out.notes = [
    "Read-only Prisma aggregation only; no test donation or campaign sends.",
    "All rows are aggregated. No donor, transaction, card, payment, contact or message IDs are returned.",
    "Operational assessment needs human interpretation of attempts versus settlements and timezone.",
    "Missing provider configuration or cron side effects cannot be inferred solely from database counts.",
    "Existing detailed audit scripts may be run separately for failure-code and cadence diagnosis.",
  ];
  console.log(JSON.stringify(out, null, 2));
  if (out.incomplete) process.exitCode = 2;
} catch {
  console.error(JSON.stringify({ status: "AUDIT_FAILED", readOnly: true, databaseWrites: 0, providerCalls: 0 }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
