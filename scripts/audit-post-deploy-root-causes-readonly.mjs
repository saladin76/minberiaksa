#!/usr/bin/env node
/**
 * Anonymous root-cause evidence for post-deployment incidents.
 * Run on the production VPS from /root/minberiaksa via "git show ... | node --input-type=module".
 * 100% READ ONLY. Never sends email, WhatsApp, SMS, charges, provider probes,
 * cron requests, reconciliation, logs or writes. No secrets or personal data
 * appear in the output. No provider response bodies or raw error messages.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const require = createRequire(resolve(process.cwd(), "package.json"));
require("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ log: [] });
const hours = [24, 72], maxRows = 12000, pageSize = 400, now = Date.now();
const allowedEvents = new Set([
  "DONATION_PAID", "DONATION_FAILED", "FIRST_DONATION", "USER_REGISTERED",
  "SUBSCRIPTION_CREATED", "SUBSCRIPTION_PAYMENT", "SUBSCRIPTION_CANCELLED", "DONATION_LAPSED",
]);
const result = {
  checkedAt: new Date(now).toISOString(), readOnly: true, databaseWrites: 0,
  financialOperations: 0, providerRequests: 0, cronRequests: 0, messagesSent: 0,
};
const safe = v => {
  const value = String(v ?? "UNKNOWN").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return value.slice(0, 30) || "UNKNOWN";
};
const bump = (record, key) => { record[key] = (record[key] || 0) + 1; };
const top = (data, cap = 20) => Object.entries(data).sort((a, b) => b[1] - a[1])
  .slice(0, cap).map(([key, count]) => ({ key, count }));
const age = time => {
  const hrs = Math.max(0, Math.floor((now - new Date(time).getTime()) / 3600000));
  return hrs < 6 ? "0-6h" : hrs < 24 ? "6-24h" : hrs < 48 ? "24-48h" : "48-72h";
};
const reasonCodes = [
  "ELASTIC_EMAIL_UNAUTHORIZED", "ELASTIC_EMAIL_RATE_LIMITED", "ELASTIC_EMAIL_REJECTED",
  "ELASTIC_EMAIL_REQUEST_FAILED", "ELASTIC_EMAIL_INVALID_RESPONSE",
  "ELASTIC_EMAIL_NOT_CONFIGURED", "ELASTIC_EMAIL_SENDER_NOT_CONFIGURED",
  "INTEGRATION_DECRYPTION_FAILED", "INTEGRATION_DATABASE_UNAVAILABLE",
  "EMAIL_MARKETING_OPT_IN_REQUIRED", "EMAIL_SUPPRESSED", "CONSENT_CHECK_UNAVAILABLE",
  "INVALID_CONTACT", "PROVIDER_DISABLED", "EMAIL_SEND_FAILED", "ARCHIVE_FAILED",
  "DELIVERY_OUTCOME_UNCERTAIN", "META_WHATSAPP_REQUEST_FAILED", "META_WHATSAPP_UNAUTHORIZED",
];
function family(text) {
  const value = String(text ?? "").toUpperCase();
  for (const code of reasonCodes) if (value.includes(code)) return code;
  if (/ACCESS DENIED|INVALID.API.KEY|UNAUTHORIZ/.test(value)) return "ACCESS_OR_CREDENTIAL";
  if (/\b131026\b|UNDELIVERABLE/.test(value)) return "META_UNDELIVERABLE";
  if (/\b131049\b|HEALTHY ECOSYSTEM/.test(value)) return "META_ECOSYSTEM_LIMIT";
  if (/SPAM|BLACKLIST|SUPPRESS|BOUNCE|MAILBOX/.test(value)) return "BOUNCE_OR_SUPPRESSION";
  if (/TIMEOUT|ECONN|NETWORK|FETCH FAILED|DNS|SOCKET/.test(value)) return "NETWORK_OR_TIMEOUT";
  if (/RATE.LIMIT|THROTT|QUOTA/.test(value)) return "RATE_OR_QUOTA";
  if (/NOT CONFIGURED|MISSING CONFIG|SENDER/.test(value)) return "MISSING_CONFIG_OR_SENDER";
  const httpStatus = value.match(/(?:^|[^0-9])(400|401|403|404|408|409|422|429|500|502|503|504)(?:[^0-9]|$)/);
  if (httpStatus) return "HTTP_" + httpStatus[1];
  return value.trim() ? "UNKNOWN_ERROR_FAMILY" : "NO_ERROR_RECORDED";
}
function fingerprint(text) {
  const scrub = String(text ?? "")
    .toLowerCase()
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[a-z0-9]{24,}\b/gi, "[opaque]")
    .replace(/\b\d{5,}\b/g, "[number]")
    .slice(0, 250);
  return createHash("sha256").update(scrub).digest("hex").slice(0, 12);
}
async function scan(model, where, select, handle) {
  let cursor, seen = 0;
  while (seen < maxRows) {
    const batch = await model.findMany({
      where, select, orderBy: { id: "asc" }, take: Math.min(pageSize, maxRows - seen),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) return { scanned: seen, truncated: false };
    for (const row of batch) handle(row);
    seen += batch.length;
    if (batch.length < Math.min(pageSize, maxRows - (seen - batch.length))) return { scanned: seen, truncated: false };
    cursor = batch.at(-1)?.id;
  }
  return { scanned: seen, truncated: true };
}
async function step(name, fn) {
  try { result[name] = await fn(); }
  catch { result[name] = { status: "UNAVAILABLE_OR_QUERY_FAILED" }; result.incomplete = true; }
}
try {
  for (const windowHours of hours) {
    const since = new Date(now - windowHours * 3600000);
    await step("emailAndWhatsappCauses" + windowHours + "h", async () => {
      const byEvent = {}, byReason = {}, byTime = {}, byReasonEvent = {}, fingerprints = {};
      let failedEmail = 0, failedWhatsapp = 0, unclassified = 0;
      const scanResult = await scan(db.communicationDelivery, {
        createdAt: { gte: since }, channel: { in: ["EMAIL", "WHATSAPP"] },
        status: { in: ["FAILED", "BOUNCED"] },
      }, {
        id: true, createdAt: true, channel: true, status: true,
        purpose: true, origin: true, provider: true, errorMessage: true, variables: true,
      }, row => {
        const channel = safe(row.channel);
        channel === "EMAIL" ? failedEmail++ : failedWhatsapp++;
        const data = row.variables && typeof row.variables === "object" && !Array.isArray(row.variables)
          ? row.variables : {};
        const trigger = data.trigger && typeof data.trigger === "object" && !Array.isArray(data.trigger)
          ? data.trigger : {};
        const event = allowedEvents.has(trigger.event) ? trigger.event : "UNKNOWN_OR_NOT_TRIGGER";
        const type = family(row.errorMessage);
        if (type === "UNKNOWN_ERROR_FAMILY") unclassified++;
        const group = [channel, safe(row.purpose), safe(row.origin), event].join("/");
        bump(byEvent, group);
        bump(byReason, channel + "/" + type);
        bump(byReasonEvent, channel + "/" + type + "/" + event);
        bump(byTime, channel + "/" + age(row.createdAt));
        // Count recurring error signatures only; don't print raw messages.
        // Distinct signatures with low counts are not included in the output.
        const hash = channel + "/" + fingerprint(row.errorMessage);
        bump(fingerprints, hash);
      });
      const commonFingerprints = top(fingerprints, 12).filter(x => x.count >= 3);
      return {
        ...scanResult, emailFailures: failedEmail, whatsappFailures: failedWhatsapp,
        unclassifiedFailures: unclassified, byTriggerEvent: top(byEvent, 25),
        byReasonFamily: top(byReason, 22), byReasonAndEvent: top(byReasonEvent, 22),
        byAgeBucket: top(byTime, 10),
        repeatedErrorSignatures: commonFingerprints,
        note: "Hash labels are non-reversible grouping aids, NOT error messages. A repeated hash points to a shared failure signature but does not prove its cause.",
      };
    });
    await step("unconfirmedElectronicPayments" + windowHours + "h", async () => {
      let statusPaidWithoutPaidAt = 0;
      const byGateway = {}, byProofFlags = {}, byBilling = {}, byAge = {};
      const scanResult = await scan(db.donation, { createdAt: { gte: since } }, {
        id: true, createdAt: true, status: true, paidAt: true, provider: true,
        paymentMethod: true, billingReason: true, paypalOrderId: true,
        paypalCaptureId: true, providerOrderId: true, providerAuthCode: true,
        providerTxnResult: true, providerProcReturnCode: true,
      }, row => {
        if (row.status !== "PAID" || row.paidAt != null || row.paymentMethod === "BANK_TRANSFER") return;
        statusPaidWithoutPaidAt++;
        const provider = safe(row.provider), method = safe(row.paymentMethod);
        bump(byGateway, provider + "/" + method);
        const flags = "order=" + Number(Boolean(row.paypalOrderId || row.providerOrderId)) +
          "/capture=" + Number(Boolean(row.paypalCaptureId)) +
          "/bankAuth=" + Number(Boolean(row.providerAuthCode)) +
          "/returnCode=" + Number(Boolean(row.providerProcReturnCode)) +
          "/txnSuccess=" + Number(/SUCCESS|APPROVED|SUCCEEDED|CAPTURED/i.test(String(row.providerTxnResult ?? "")));
        bump(byProofFlags, provider + "/" + flags);
        const billing = ["subscription_cycle", "subscription_create"].includes(row.billingReason)
          ? row.billingReason : "ONE_TIME_OR_LEGACY";
        bump(byBilling, provider + "/" + billing);
        bump(byAge, provider + "/" + age(row.createdAt));
      });
      return {
        ...scanResult, statusPaidWithoutPaidAt,
        byGateway: top(byGateway, 15), byProofMarkers: top(byProofFlags, 25),
        byBillingReason: top(byBilling, 15), byAgeBucket: top(byAge, 12),
        note: "Flags indicate recorded references only, not actual bank settlement. No provider requests or financial mutations were made.",
      };
    });
  }
  result.notes = [
    "No donor, email address, recipient, message, payment or external order identifiers are output.",
    "Failure families and hashes use sanitized on-device calculations; unknown buckets remain unknown.",
    "Checks are read-only and limited to 12,000 rows per query/window.",
  ];
  console.log(JSON.stringify(result, null, 2));
  if (result.incomplete) process.exitCode = 2;
} catch {
  console.error(JSON.stringify({ status: "SAFE_ROOT_CAUSE_AUDIT_FAILED", readOnly: true }));
  process.exitCode = 1;
} finally { await db.$disconnect().catch(() => {}); }
