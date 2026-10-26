/**
 * Read-only production preflight. Run from the app directory with:
 * node --import tsx /path/to/audit-production-readiness.mjs --check-providers
 * No database writes, payment-provider calls, cron execution or AI generation.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function subscriptionCounts(rows, now = new Date()) {
  const groups = {};
  for (const row of rows) {
    const stripeId = row.stripeSubscriptionId ?? row.payforToken;
    const provider = row.provider ?? (stripeId?.startsWith("sub_") ? "STRIPE" : "UNLINKED");
    const c = groups[`${provider}/${row.frequency}`] ??= { total: 0, active: 0, awaitingFirstPayment: 0, paidWithoutBillingDate: 0, missingPaymentMethod: 0, missingNextDate: 0, due: 0, eligibleForScheduler: 0 };
    c.total++;
    if (row.status !== "ACTIVE") continue;
    c.active++;
    const paid = row._count.donations > 0;
    if (!paid) c.awaitingFirstPayment++;
    if (paid && !row.lastBillingDate) c.paidWithoutBillingDate++;
    const linked = provider === "ALBARAKA" ? !!row.paymentCardId : provider === "PAYPAL" ? !!row.paypalVaultId : provider === "STRIPE" ? !!stripeId?.startsWith("sub_") : false;
    if (!linked) c.missingPaymentMethod++;
    if (!row.nextBillingDate) c.missingNextDate++;
    const due = !!row.nextBillingDate && new Date(row.nextBillingDate) <= now;
    if (due) c.due++;
    if (due && linked && paid && row.lastBillingDate && ["ALBARAKA", "PAYPAL"].includes(provider)) c.eligibleForScheduler++;
  }
  return groups;
}
export function cronLogSummary(text, now = new Date()) {
  const routes = {};
  // Ignore response bodies: they can contain private application error details.
  for (const line of text.split("\n")) {
    const match = /^(\S+) (\/api\/cron\/[a-z0-9-]+) HTTP (\d{3})\b/.exec(line);
    if (!match) continue;
    const stamp = Date.parse(match[1]);
    if (!Number.isFinite(stamp) || stamp < now.getTime() - 24 * 60 * 60_000) continue;
    const r = routes[match[2]] ??= { attempts: 0, successful: 0, connectionFailures: 0, lastAt: null, lastStatus: null };
    r.attempts++; if (match[3].startsWith("2")) r.successful++; if (match[3] === "000") r.connectionFailures++;
    if (!r.lastAt || stamp >= Date.parse(r.lastAt)) { r.lastAt = new Date(stamp).toISOString(); r.lastStatus = match[3]; }
  }
  return routes;
}
function statusForHttp(status) { return status === 401 || status === 403 ? "access_denied" : status === 429 ? "rate_limited" : "unavailable"; }
export async function auditGooglePermissions({ account, propertyId, origin, propertyOverride, getToken, request = fetch, now = new Date() }) {
  if (!account?.client_email || !account?.private_key) return { status: "credentials_missing_or_invalid" };
  const out = { serviceAccountEmail: account.client_email, ga4: { status: "not_checked" }, searchConsole: { status: "not_checked" } };
  const call = async (url, token, body) => request(url, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12_000) });
  try {
    if (!/^\d{4,20}$/.test(propertyId ?? "")) out.ga4 = { status: "property_missing_or_invalid" };
    else {
      const token = await getToken("https://www.googleapis.com/auth/analytics.readonly");
      const res = await call(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, token, { dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }], metrics: [{ name: "sessions" }], limit: 1 });
      out.ga4 = { status: res.ok ? "ready" : statusForHttp(res.status), httpStatus: res.status };
    }
  } catch { out.ga4 = { status: "authentication_or_network_failed" }; }
  try {
    const host = new URL(origin).hostname;
    const token = await getToken("https://www.googleapis.com/auth/webmasters.readonly");
    const response = await call("https://www.googleapis.com/webmasters/v3/sites", token);
    if (!response.ok) { out.searchConsole = { status: statusForHttp(response.status), httpStatus: response.status }; return out; }
    const json = await response.json();
    const matchesHost = (site) => { try { return site === `sc-domain:${host}` || new URL(site).hostname === host; } catch { return false; } };
    if (propertyOverride && !matchesHost(propertyOverride)) { out.searchConsole = { status: "property_host_mismatch" }; return out; }
    const sites = (json.siteEntry ?? []).filter(site => matchesHost(site.siteUrl) && site.permissionLevel !== "siteUnverifiedUser");
    const selected = propertyOverride ? sites.find(s => s.siteUrl === propertyOverride) : sites.find(s => s.siteUrl === `sc-domain:${host}`) ?? sites.find(s => s.siteUrl === new URL("/", origin).href);
    if (!selected) { out.searchConsole = { status: "property_access_missing" }; return out; }
    const endDate = new Date(now.getTime() - 3 * 86400_000).toISOString().slice(0, 10);
    const res = await call(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(selected.siteUrl)}/searchAnalytics/query`, token, { startDate: endDate, endDate, dimensions: [], rowLimit: 1 });
    out.searchConsole = { status: res.ok ? "ready" : statusForHttp(res.status), property: selected.siteUrl, permission: selected.permissionLevel, httpStatus: res.status };
  } catch { out.searchConsole = { status: "authentication_or_network_failed" }; }
  return out;
}
export async function auditOpenAiAccess(env, request = fetch) {
  const configured = !!env.OPENAI_API_KEY?.trim();
  const externalCallsEnabled = env.AI_CORE_ENABLE_EXTERNAL_CALLS === "true";
  const model = env.AI_CORE_OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini";
  const out = { configured, externalCallsEnabled, model, status: configured && externalCallsEnabled ? "configured" : "not_ready", generationRequests: 0 };
  if (!configured || !externalCallsEnabled) return out;
  const base = (env.AI_CORE_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  if (base !== "https://api.openai.com/v1") return { ...out, status: "custom_endpoint_not_probed" };
  try {
    const res = await request(`${base}/models/${encodeURIComponent(model)}`, { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, signal: AbortSignal.timeout(12_000) });
    return { ...out, status: res.ok ? "model_access_ready" : statusForHttp(res.status), httpStatus: res.status };
  } catch { return { ...out, status: "network_failed" }; }
}
export function localProbeBases(override, port = "3000") {
  const safePort = /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535 ? port : "3000";
  const bases = [`http://localhost:${safePort}`, `http://127.0.0.1:${safePort}`, `http://[::1]:${safePort}`];
  if (override) {
    try { const u = new URL(override); if (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.username && !u.password && !u.search && !u.hash) bases.unshift(u.origin); } catch {}
  }
  return [...new Set(bases)];
}
async function main() {
  const cwd = process.cwd();
  const require = createRequire(resolve(cwd, "package.json"));
  require("@next/env").loadEnvConfig(cwd, false, { info() {}, error() {} });
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ log: [] });
  const load = async (path) => { const m = await import(pathToFileURL(resolve(cwd, path)).href); return m.default ?? m; };
  const report = { checkedAt: new Date().toISOString(), readOnly: true, databaseWrites: 0, paymentProviderCalls: 0, cronExecutionRequests: 0, environmentSource: "CLI environment plus Next production env files; PM2 process environment is not read" };
  try {
    const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { mainGateway: true, quickDonation: true } });
    report.mainGateway = settings?.mainGateway ?? null;
    const quick = settings?.quickDonation;
    const keys = Array.isArray(quick?.genericDestinations) ? quick.genericDestinations : ["where-needed", "zakat", "waqf", "gaza-relief"];
    const ids = keys.map(key => quick?.genericProjectIds?.[key]).filter(id => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id));
    const campaigns = ids.length ? await prisma.campaign.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, isDeleted: true } }) : [];
    report.quickDonation = { enabled: quick?.enabled ?? true, destinations: keys.map(key => { const id = quick?.genericProjectIds?.[key]; const campaign = campaigns.find(c => c.id === id); return { intention: key, status: !id ? "approved_mapping_missing" : campaign?.isActive && campaign.isDeleted !== true ? "ready" : "target_unavailable" }; }) };
    const albaraka = await load("lib/albaraka.ts");
    report.oneTimePayments = { twoDConfigured: albaraka.isAlbarakaConfigured(albaraka.albaraka2DConfig()), threeDConfigured: albaraka.isAlbarakaConfigured(albaraka.albarakaConfig()), verificationCalls: 0 };
    report.recurring = { signupTerminalConfigured: albaraka.isAlbarakaConfigured(albaraka.albaraka2DConfig()), recurringTerminalConfigured: albaraka.isAlbarakaConfigured(albaraka.albarakaRecurringConfig()), recurringEnabled: albaraka.isAlbarakaRecurringEnabled(), cronSecretPresent: !!process.env.CRON_SECRET?.trim() };
    const groups = {}; let cursor;
    for (;;) {
      const rows = await prisma.subscription.findMany({ orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, provider: true, frequency: true, status: true, stripeSubscriptionId: true, payforToken: true, paymentCardId: true, paypalVaultId: true, lastBillingDate: true, nextBillingDate: true, _count: { select: { donations: { where: { paidAt: { not: null } } } } } } });
      for (const [key, counts] of Object.entries(subscriptionCounts(rows))) { const target = groups[key] ??= {}; for (const [k, v] of Object.entries(counts)) target[k] = (target[k] ?? 0) + v; }
      if (rows.length < 500) break; cursor = rows.at(-1).id;
    }
    report.subscriptions = groups;
    try {
      const runner = readFileSync(resolve(cwd, "scripts/vps-cron-run.sh"), "utf8");
      report.cronRunner = { defaultUsesLocalhost: runner.includes('CRON_BASE_URL:-http://localhost:'), defaultUsesIpv4: runner.includes('CRON_BASE_URL:-http://127.0.0.1:'), overridePresent: !!process.env.CRON_BASE_URL?.trim() };
    } catch { report.cronRunner = "unavailable"; }
    try { const raw = execFileSync("crontab", ["-l"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }); report.installedCronRoutes = [...new Set(raw.split("\n").filter(l => !l.trim().startsWith("#")).flatMap(l => l.match(/\/api\/cron\/[a-z0-9-]+/g) ?? []))]; } catch { report.installedCronRoutes = "unavailable"; }
    try { report.cronLast24Hours = cronLogSummary(readFileSync(process.env.CRON_LOG || "/var/log/minberiaksa-cron.log", "utf8").slice(-5_300_000)); } catch { report.cronLast24Hours = "log_unavailable"; }
    report.loopback = localProbeBases(process.env.CRON_BASE_URL, process.env.PORT).map(base => {
      try { const raw = execFileSync("curl", ["--silent", "--show-error", "--noproxy", "*", "--connect-timeout", "2", "--max-time", "4", `${base}/api/global-settings`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 6000 }); const json = JSON.parse(raw); return { base, applicationResponds: typeof json.mainGateway === "string" }; } catch { return { base, applicationResponds: false }; }
    });
    if (process.argv.includes("--check-providers")) {
      const raw = await prisma.$runCommandRaw({ find: "TrackingSettings", sort: { createdAt: 1 }, limit: 1, projection: { gaPropertyId: 1, gaServiceAccountEncrypted: 1 } });
      const tracking = raw?.cursor?.firstBatch?.[0] ?? {};
      let account;
      try { const crypto = await load("lib/integration-settings/crypto.ts"); const json = tracking.gaServiceAccountEncrypted ? crypto.decryptIntegrationSecret(tracking.gaServiceAccountEncrypted, "tracking-settings:ga4-service-account") : process.env.GA4_SERVICE_ACCOUNT_JSON; account = json ? JSON.parse(json) : undefined; } catch { report.google = { status: "credentials_unreadable" }; }
      if (!report.google) {
        const { JWT } = require("google-auth-library");
        report.google = await auditGooglePermissions({ account, propertyId: tracking.gaPropertyId || process.env.GA4_PROPERTY_ID, origin: process.env.NEXT_PUBLIC_SITE_URL || "https://minberiaksa.org", propertyOverride: process.env.SEARCH_CONSOLE_SITE_URL, getToken: async scope => (await new JWT({ email: account.client_email, key: account.private_key, scopes: [scope] }).getAccessToken()).token });
      }
      report.aiCore = await auditOpenAiAccess(process.env);
    } else { report.providerChecks = "not_requested; use --check-providers for read-only Google/OpenAI access checks"; }
    report.notes = ["No cron or payment endpoint was invoked. Loopback probes only GET public global-settings.", "A reachable loopback alone does not prove authenticated cron success; review recent route logs.", "Missing historical plan data is reported only; subscriptions are never activated, repaired or charged.", "Only matching Search Console properties are reported. Google queries are read-only. OpenAI checks model metadata without generating content.", "Keys, tokens, card references, donor contacts and subscription identifiers are not printed."];
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(() => { console.error("Read-only production audit failed. Check dependencies, app directory and database access; no secret error details are printed."); process.exitCode = 1; });
