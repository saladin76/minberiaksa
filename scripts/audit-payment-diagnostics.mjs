#!/usr/bin/env node
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Run from the application directory. Works when extracted to /tmp with git show.
 * node /tmp/audit-payment-diagnostics.mjs --days 7 --check-paypal --paypal-limit 12
 *
 * Never imports settlement, reconciliation, card charging, messaging or cron code.
 * The only outbound requests are PayPal OAuth and GET of existing Orders v2 orders.
 * Output contains aggregate counts and anonymous samples, never donor/order/card IDs.
 */
const HOUR = 3_600_000;
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const allowed = (value, values) => values.includes(value) ? value : "UNKNOWN";
const currency = value => allowed(value, ["USD", "EUR", "TRY", "TL", "US", "EU", "GBP", "SAR", "KWD", "QAR", "AED", "CAD", "AUD", "JPY", "BHD", "JOD", "OMR"]);
const increment = (counts, key) => { counts[key] = (counts[key] ?? 0) + 1; };

function integerOption(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error("Invalid audit option");
  return value;
}

function bankCode(row) {
  const code = String(row.providerProcReturnCode ?? "").toUpperCase().trim();
  if (/^00\d{2}$/.test(code)) return code.slice(2);
  return /^(\d{2}|\d[A-Z]|\d{4})$/.test(code) ? code : "UNKNOWN";
}

function failureKind(row, code) {
  if (["59", "34", "63", "83"].includes(code)) return "fraud_or_security_decline";
  if (code === "1A") return "additional_authentication_required";
  if (code === "0148") return "merchant_terminal_or_ip_rejected";
  if (code === "0127") return "duplicate_order_reference";
  if (code === "UNKNOWN" && /fraud|şüphe|suphe/i.test(row.providerErrorMessage ?? "")) return "fraud_text_without_code";
  return "other_decline_or_error";
}

function ageHours(row, now) {
  return Math.max(0, Math.round((now.getTime() - new Date(row.createdAt).getTime()) / HOUR));
}

function stateCounts(rows) {
  return {
    total: rows.length,
    confirmed: rows.filter(row => row.paidAt).length,
    failed: rows.filter(row => !row.paidAt && row.status === "FAILED").length,
    unconfirmed: rows.filter(row => !row.paidAt && row.status !== "FAILED").length,
    failedWithPaidAt: rows.filter(row => row.paidAt && row.status === "FAILED").length,
  };
}

function paypalSnapshot(row) { return object(object(row.providerRaw).paypalRequest); }
function paypalOrderId(row) { return row.paypalOrderId || paypalSnapshot(row).orderId || row.providerOrderId || ""; }
function isRenewal(row) { return Boolean(object(row.providerRaw).paypalRecurring) || row.billingReason === "subscription_cycle"; }

function inspectOrder(row, order, expectedId) {
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const captures = units.flatMap(unit => Array.isArray(unit?.payments?.captures) ? unit.payments.captures : []);
  const capture = object(captures[0]);
  const snapshot = paypalSnapshot(row);
  const orderStatus = allowed(order.status, ["CREATED", "SAVED", "APPROVED", "VOIDED", "COMPLETED", "PAYER_ACTION_REQUIRED"]);
  const captureStatus = captures.length ? allowed(capture.status, ["COMPLETED", "PENDING", "DECLINED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]) : "NONE";
  const pendingReason = captureStatus === "PENDING" ? allowed(capture.status_details?.reason, [
    "BUYER_COMPLAINT", "CHARGEBACK", "ECHECK", "INTERNATIONAL_WITHDRAWAL", "OTHER", "PENDING_REVIEW",
    "RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION", "REFUNDED", "TRANSACTION_APPROVED_AWAITING_FUNDING",
    "UNILATERAL", "VERIFICATION_REQUIRED", "DECLINED_BY_RISK_FRAUD_FILTERS",
  ]) : null;
  const amount = object(capture.amount);
  const expectedValue = Number(snapshot.value);
  const receivedValue = Number(amount.value);
  const validAmount = value => typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value);
  const checks = {
    orderIdMatches: typeof order.id === "string" && order.id === expectedId,
    snapshotOrderIdMatches: typeof snapshot.orderId === "string" ? snapshot.orderId === expectedId : null,
    customIdMatches: (units[0]?.custom_id ?? capture.custom_id ?? "") === row.id,
    singlePurchaseUnit: units.length === 1,
    singleCapture: captures.length === 1,
    captureIdMatches: row.paypalCaptureId ? row.paypalCaptureId === capture.id : null,
    currencyMatches: typeof snapshot.currency === "string" && typeof amount.currency_code === "string" ? snapshot.currency === amount.currency_code : null,
    amountMatches: validAmount(snapshot.value) && validAmount(amount.value) && Number.isFinite(expectedValue) && Number.isFinite(receivedValue) ? Math.abs(expectedValue - receivedValue) < 0.005 : null,
  };
  let verdict = "unresolved_provider_state";
  const identityMismatch = !checks.orderIdMatches || checks.snapshotOrderIdMatches === false;
  if (identityMismatch) verdict = "order_identity_mismatch";
  else if (captureStatus === "PENDING") verdict = "provider_capture_pending";
  else if (captureStatus === "COMPLETED") {
    const verified = orderStatus === "COMPLETED" && checks.snapshotOrderIdMatches === true && checks.customIdMatches && checks.singlePurchaseUnit && checks.singleCapture && checks.captureIdMatches !== false && checks.currencyMatches === true && checks.amountMatches === true;
    verdict = verified ? "completed_not_recorded_locally" : "completed_requires_integrity_review";
  } else if (["FAILED", "DECLINED"].includes(captureStatus)) verdict = "provider_capture_failed";
  else if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(captureStatus)) verdict = "provider_capture_refunded";
  else if (orderStatus === "VOIDED") verdict = "provider_order_voided";
  else if (orderStatus === "APPROVED" && !captures.length) verdict = "buyer_approved_capture_missing";
  else if (["CREATED", "SAVED", "PAYER_ACTION_REQUIRED"].includes(orderStatus) && !captures.length) verdict = "awaiting_buyer_approval";
  return { verdict, orderStatus, captureStatus, pendingReason, checks };
}

export async function auditPaymentDiagnostics({ db, env = {}, days, rowLimit, checkPayPal = false, paypalLimit, now = new Date(), request = fetch }) {
  days = integerOption(days, 7, 31);
  rowLimit = integerOption(rowLimit, 5000, 10000);
  paypalLimit = integerOption(paypalLimit, 12, 30);
  const since = new Date(now.getTime() - days * 24 * HOUR);
  const fetched = await db.donation.findMany({
    where: { createdAt: { gte: since, lte: now }, OR: [{ provider: "ALBARAKA" }, { provider: "PAYPAL" }, { paymentMethod: "PAYPAL" }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: rowLimit + 1,
    select: {
      id: true, donorId: true, createdAt: true, paidAt: true, status: true, provider: true, paymentMethod: true,
      providerOrderId: true, providerProcReturnCode: true, providerErrorMessage: true, providerRaw: true,
      currency: true, paypalOrderId: true, paypalCaptureId: true, billingReason: true,
    },
  });
  const rows = fetched.slice(0, rowLimit);
  const bankRows = rows.filter(row => row.provider === "ALBARAKA");
  const failures = bankRows.filter(row => !row.paidAt && row.status === "FAILED");
  const codes = new Map();
  for (const row of failures) {
    const code = bankCode(row);
    const kind = failureKind(row, code);
    const key = `${code}/${kind}`;
    const group = codes.get(key) ?? { code, kind, attempts: 0, donors: new Set(), rowsWithoutDonor: 0, modes: {}, currencyPairs: {} };
    group.attempts++;
    if (row.donorId) group.donors.add(row.donorId); else group.rowsWithoutDonor++;
    const snapshot = object(object(row.providerRaw).albarakaRequest);
    increment(group.modes, allowed(snapshot.mode, ["2D", "3D", "3DS"]));
    increment(group.currencyPairs, `${currency(row.currency)}->${currency(snapshot.currencyCode)}`);
    codes.set(key, group);
  }
  const paypalRows = rows.filter(row => row.provider === "PAYPAL" || row.paymentMethod === "PAYPAL");
  const pending = paypalRows.filter(row => !row.paidAt && row.status !== "FAILED");
  const candidates = pending.filter(row => !isRenewal(row) && paypalOrderId(row));
  // Prefer rows with a known capture, then the newest rows; this is a bounded sample, not a census.
  candidates.sort((a, b) => Number(Boolean(b.paypalCaptureId)) - Number(Boolean(a.paypalCaptureId)) || new Date(b.createdAt) - new Date(a.createdAt));
  const report = {
    checkedAt: now.toISOString(), readOnly: true,
    databaseWrites: 0, paymentChargeCalls: 0, messagingCalls: 0, cronExecutionRequests: 0, albarakaProviderCalls: 0,
    paypalAuthRequests: 0, paypalOrderReads: 0,
    environmentSource: "CLI environment plus Next production env files; PM2 process environment is not read",
    window: { since: since.toISOString(), until: now.toISOString(), rowsRead: rows.length, rowLimit, truncated: fetched.length > rowLimit, ordering: "newest first" },
    albaraka: {
      ...stateCounts(bankRows),
      failureCodes: [...codes.values()].map(({ donors, rowsWithoutDonor, ...group }) => ({ ...group, uniqueDonors: donors.size, rowsWithoutDonor, repeatedAttemptsByKnownDonors: group.attempts - donors.size - rowsWithoutDonor })).sort((a, b) => b.attempts - a.attempts),
      note: "These are attempts and distinct donor accounts, not distinct cards or issuer countries. Request currency is attempted, not proof of a debit. No bank inquiry is made.",
    },
    paypal: {
      ...stateCounts(paypalRows),
      unconfirmedOlderThan24Hours: pending.filter(row => now.getTime() - new Date(row.createdAt).getTime() > 24 * HOUR).length,
      unconfirmedWithoutOrder: pending.filter(row => !paypalOrderId(row)).length,
      unconfirmedWithCaptureReference: pending.filter(row => row.paypalCaptureId).length,
      renewalRowsExcludedFromProbes: pending.filter(isRenewal).length,
      eligibleForOrderRead: candidates.length, sampleLimit: paypalLimit,
      sampling: "capture reference first, then newest; remaining orders are not checked",
      providerCheck: checkPayPal ? "not_started" : "not_requested", checks: [],
    },
    notes: [
      "No capture, sale, retry, settlement, cancellation, reconciliation or notification is performed.",
      "Unconfirmed local rows are not proof of a decline, completed payment or provider hold.",
      "PayPal probes only read pending initial checkouts; automatic renewals require a separate investigation.",
      "No donor contacts, card data, credentials, order/capture identifiers or raw gateway messages are printed.",
    ],
  };
  if (!checkPayPal) return report;
  const base = (env.PAYPAL_BASE_URL ?? "https://api-m.paypal.com").trim().replace(/\/+$/, "");
  if (!["https://api-m.paypal.com", "https://api-m.sandbox.paypal.com"].includes(base)) {
    report.paypal.providerCheck = "custom_endpoint_not_probed"; return report;
  }
  report.paypal.environment = base.includes("sandbox") ? "sandbox" : "live";
  if (!env.PAYPAL_CLIENT_ID?.trim() || !env.PAYPAL_CLIENT_SECRET?.trim()) {
    report.paypal.providerCheck = "credentials_missing"; return report;
  }
  if (!candidates.length) { report.paypal.providerCheck = "no_eligible_orders"; return report; }
  let token;
  try {
    report.paypalAuthRequests++;
    const response = await request(`${base}/v1/oauth2/token`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID.trim()}:${env.PAYPAL_CLIENT_SECRET.trim()}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) { report.paypal.providerCheck = "authentication_failed"; report.paypal.httpStatus = response.status; return report; }
    const body = await response.json();
    if (typeof body.access_token !== "string" || !body.access_token) { report.paypal.providerCheck = "invalid_authentication_response"; return report; }
    token = body.access_token;
  } catch { report.paypal.providerCheck = "authentication_or_network_failed"; return report; }
  report.paypal.providerCheck = "sample_checked";
  let networkFailures = 0;
  for (const row of candidates.slice(0, paypalLimit)) {
    const sample = { sample: `P${String(report.paypal.checks.length + 1).padStart(2, "0")}`, ageHours: ageHours(row, now), localCaptureReference: Boolean(row.paypalCaptureId) };
    const id = paypalOrderId(row);
    if (typeof id !== "string" || !/^[A-Z0-9]{8,32}$/i.test(id)) {
      report.paypal.checks.push({ ...sample, verdict: "invalid_local_order_reference" }); continue;
    }
    try {
      report.paypalOrderReads++;
      const response = await request(`${base}/v2/checkout/orders/${encodeURIComponent(id)}`, {
        method: "GET", redirect: "error", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        report.paypal.checks.push({ ...sample, verdict: "order_lookup_failed", httpStatus: response.status });
        if ([401, 403, 429].includes(response.status)) { report.paypal.providerCheck = "stopped_on_access_or_rate_limit"; break; }
        continue;
      }
      const order = await response.json();
      report.paypal.checks.push({ ...sample, ...inspectOrder(row, object(order), id) });
      networkFailures = 0;
    } catch {
      report.paypal.checks.push({ ...sample, verdict: "network_or_invalid_response" });
      if (++networkFailures >= 2) { report.paypal.providerCheck = "stopped_after_network_failures"; break; }
    }
  }
  return report;
}

export function parseAuditOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--check-paypal") { options.checkPayPal = true; continue; }
    const key = { "--days": "days", "--paypal-limit": "paypalLimit", "--row-limit": "rowLimit" }[arg];
    if (!key || !/^\d+$/.test(args[i + 1] ?? "")) throw new Error("Unknown or invalid audit option");
    options[key] = Number(args[++i]);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db;
  try {
    const options = parseAuditOptions(process.argv.slice(2));
    // Resolve dependencies from the application, not from the temporary script's folder.
    const requireApp = createRequire(resolve(process.cwd(), "package.json"));
    requireApp("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
    const { PrismaClient } = requireApp("@prisma/client");
    db = new PrismaClient({ log: [] });
    console.log(JSON.stringify(await auditPaymentDiagnostics({ db, env: process.env, ...options }), null, 2));
  } catch {
    console.error("Read-only payment audit failed. Check the application directory, options and database access. Private details suppressed.");
    process.exitCode = 1;
  } finally {
    if (db) await db.$disconnect().catch(() => {});
  }
}
