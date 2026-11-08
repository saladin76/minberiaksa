#!/usr/bin/env node
/**
 * Anonymous read-only incident drilldown. Run via git show and stdin on Radore:
 *   git show FETCH_HEAD:scripts/audit-post-deploy-anomalies-readonly.mjs | node --input-type=module
 *
 * Uses only Prisma.findMany/groupBy/count. Never prints provider error text,
 * donor details, card/payment/recipient/message IDs or message bodies. No
 * provider requests, payment capture/retry, email or WA sends, cron or writes.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(resolve(process.cwd(), "package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: [] });
const windowHours = [24, 72];
const now = Date.now();
const summary = {
  checkedAt: new Date(now).toISOString(),
  readOnly: true, databaseWrites: 0, financialOperations: 0,
  providerRequests: 0, cronExecutions: 0, recipientMessages: 0,
};
const clean = val => {
  const str = String(val ?? "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return str.slice(0, 36) || "UNKNOWN";
};
function countGroup(rows, keys) {
  return rows.map(row => ({
    ...Object.fromEntries(keys.map(k => [k, clean(row[k])])),
    count: row._count?._all ?? 0,
  })).sort((a,b) => b.count - a.count);
}
function classify(text, channel) {
  const value = String(text ?? "").toLowerCase();
  if (!value.trim()) return "NO_ERROR_DETAILS_RECORDED";
  if (/131049|healthy ecosystem|engagement|frequency.cap/.test(value)) return "META_ECOSYSTEM_LIMIT";
  if (/131026|undeliverable|not a whatsapp user/.test(value)) return "META_UNDELIVERABLE";
  if (/131048|rate.limit|too many requests|throttl|quota|429/.test(value)) return "RATE_LIMIT_OR_QUOTA";
  if (/131047|outside.*24.hour|re.engagement/.test(value)) return "WHATSAPP_SESSION_WINDOW";
  if (/unsubscribe|do.not.contact|recipient.opt.out|unsubscribed/.test(value)) return "OPTOUT_POLICY";
  if (/whatsapp_opt_in_required|consent_blocked/.test(value)) return "RETIRED_OPTIN_OR_POLICY_GUARD";
  if (/bad.email|invalid.email|mailbox|bounce|blocked|suppressed|invalid.recipient|unknown.user/.test(value)) return "ADDRESS_OR_DELIVERABILITY";
  if (/template|parameter|language|locale/.test(value)) return "TEMPLATE_OR_LANGUAGE";
  if (/401|403|unauthoriz|invalid.api.key|invalid.token|authentication|auth.fail|credential|access.denied/.test(value)) return "PROVIDER_AUTH_OR_ACCESS";
  if (/timeout|econn|network|fetch.fail|socket|dns|connect|503|502|504/.test(value)) return "NETWORK_OR_PROVIDER_UNAVAILABLE";
  if (/400|422|rejected|invalid.request|invalid.sender|domain.not.verified|from.address/.test(value)) return "PROVIDER_REJECTION_OR_SENDER";
  return channel === "EMAIL" ? "OTHER_EMAIL_FAILURE" : "OTHER_DELIVERY_FAILURE";
}
function increase(map, key) { map[key] = (map[key] ?? 0) + 1; }
async function aggregateFailures(since) {
  const out = { totalFailures: 0, causesByChannel: {}, failuresByPurpose: {}, failuresByOrigin: {}, scanLimit: 15000, truncated: false };
  let cursor;
  while (out.totalFailures < out.scanLimit) {
    const batch = await prisma.communicationDelivery.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ["FAILED", "BOUNCED", "SKIPPED"] },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true, channel: true, status: true, provider: true,
        purpose: true, origin: true, errorMessage: true,
      },
      orderBy: { id: "asc" },
      take: Math.min(250, out.scanLimit - out.totalFailures),
    });
    if (!batch.length) break;
    for (const row of batch) {
      const channel = clean(row.channel);
      const cause = classify(row.errorMessage, channel);
      increase(out.causesByChannel, channel + "/" + cause);
      increase(out.failuresByPurpose, channel + "/" + clean(row.purpose));
      increase(out.failuresByOrigin, channel + "/" + clean(row.origin));
      out.totalFailures++;
    }
    if (batch.length < 250) break;
    cursor = batch.at(-1).id;
  }
  if (out.totalFailures === out.scanLimit) out.truncated = true;
  return out;
}
async function section(key, fn) {
  try { summary[key] = await fn(); }
  catch {
    summary[key] = { status: "READ_FAILED_OR_UNAVAILABLE" };
    summary.incomplete = true;
  }
}
try {
  for (const hours of windowHours) {
    const since = new Date(now - hours * 3600000);
    await section("paymentDiscrepancies" + hours + "h", async () => {
      const [paidWithoutTimestamp, timestampButNotPaid, recentFailures] = await Promise.all([
        prisma.donation.groupBy({
          by: ["provider"], where: { createdAt: { gte: since }, status: "PAID", paidAt: null },
          _count: { _all: true },
        }),
        prisma.donation.groupBy({
          by: ["provider", "status"], where: {
            createdAt: { gte: since }, status: { not: "PAID" }, paidAt: { not: null },
          }, _count: { _all: true },
        }),
        prisma.donation.groupBy({
          by: ["provider", "providerProcReturnCode"],
          where: { createdAt: { gte: since }, status: "FAILED", paidAt: null },
          _count: { _all: true },
        }),
      ]);
      return {
        paidWithoutTimestamp: countGroup(paidWithoutTimestamp, ["provider"]),
        timestampPresentButStatusNotPaid: countGroup(timestampButNotPaid, ["provider", "status"]),
        failedProviderResponseCodes: countGroup(recentFailures, ["provider", "providerProcReturnCode"]).map(row => ({
          ...row, providerProcReturnCode: /^[A-Z0-9]{1,5}$/.test(row.providerProcReturnCode) ? row.providerProcReturnCode : "UNCLASSIFIED",
        })),
        note: "PAID without paidAt is not proof money failed to arrive. Bank transfers/manual records may have different semantics; reconcile before editing.",
      };
    });
    await section("deliveryIncidents" + hours + "h", async () => {
      const [failedGroups, reasons] = await Promise.all([
        prisma.communicationDelivery.groupBy({
          by: ["channel", "purpose", "status", "provider"],
          where: { createdAt: { gte: since }, status: { in: ["FAILED", "BOUNCED", "SKIPPED"] } },
          _count: { _all: true },
        }),
        aggregateFailures(since),
      ]);
      return {
        failedByChannelPurposeProvider: countGroup(failedGroups, ["channel", "purpose", "status", "provider"]),
        ...reasons,
        note: "Classification is heuristic: only aggregated categories are output, no message contents, addresses or raw provider errors.",
      };
    });
  }
  summary.notes = [
    "Financial rows and delivery statuses are historical evidence, not proof of provider settlement/delivery.",
    "Unclassified reason buckets require non-disclosing provider log inspection.",
    "No automatic reconciliation, reactivation, subscription capture or email/SMS/WhatsApp send.",
  ];
  console.log(JSON.stringify(summary, null, 2));
  if (summary.incomplete) process.exitCode = 2;
} catch {
  console.error(JSON.stringify({ status: "INCIDENT_DRILLDOWN_UNAVAILABLE", readOnly: true, providerRequests: 0, databaseWrites: 0 }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
