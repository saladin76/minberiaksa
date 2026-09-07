/**
 * Read-only diagnostic for the two campaign-send symptoms:
 *
 *   1. SMS campaigns fail with NETGSM_REQUEST_FAILED
 *   2. EMAIL campaigns report success but nothing arrives in the inbox
 *
 * Why this script exists: `executeCampaignSend` persists only `result.reason` on the
 * delivery row (campaign-send-executor.ts) and throws away `result.detail` — so the HTTP
 * status and provider body behind NETGSM_REQUEST_FAILED are never written down anywhere.
 * And Elastic Email answers a valid API call with 2xx the moment it ACCEPTS the message,
 * which is what the campaign records as SENT; whether it was then delivered, bounced or
 * suppressed only exists on Elastic Email's side.
 *
 * This script SENDS NOTHING. It only:
 *   - resolves the same active runtime config the sender uses (DB first, env fallback)
 *   - replays the read-only halves of the Netgsm and Elastic Email APIs
 *   - reads back the recent CommunicationDelivery / CommunicationCampaign rows
 *   - asks Elastic Email what actually happened to the message ids we already stored
 *
 * Run: npx tsx --env-file=.env scripts/diagnose-communication-providers.ts
 */
import { createRequire } from "node:module";

// `runtime-config` imports "server-only", a package Next.js provides in-process and which does not
// exist in node_modules — so importing it from a plain tsx script throws MODULE_NOT_FOUND before
// any diagnosis can run. Stub it in the CJS resolver first; it is a compile-time marker with no
// behaviour, so a no-op module is a faithful stand-in outside the Next runtime.
// The app modules below are therefore loaded with `await import(...)` inside main(), AFTER the
// patch: a static `import` is hoisted and would resolve before this line ever runs.
const nodeRequire = createRequire(__filename);
type LoaderHost = { _load(request: string, ...rest: unknown[]): unknown };
const moduleInternals = nodeRequire("node:module") as unknown as LoaderHost;
const load = moduleInternals._load.bind(moduleInternals);
// Short-circuit at _load rather than _resolveFilename: the latter must hand back a real file path,
// and "server-only" has no file to point at.
moduleInternals._load = (request: string, ...rest: unknown[]) =>
  request === "server-only" ? {} : load(request, ...rest);

type PrismaClientLike = typeof import("@/lib/prisma")["prisma"];
let prisma: PrismaClientLike;

const NETGSM_SEND_ENDPOINT = process.env.NETGSM_SMS_ENDPOINT?.trim() || "https://api.netgsm.com.tr/sms/rest/v2/send";
const ELASTIC_BASE = "https://api.elasticemail.com/v4";

function head(title: string) {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}
function mask(value: string | null | undefined): string {
  if (!value) return "(empty)";
  if (value.length <= 4) return `${"*".repeat(value.length)} (len ${value.length})`;
  return `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 4, 12))}${value.slice(-2)} (len ${value.length})`;
}
function clip(text: string, max = 600): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) : "—";
}

type Probe = { status: number; ok: boolean; text: string };
async function probe(url: string, headers: Record<string, string>): Promise<Probe | { error: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal }).finally(() => clearTimeout(timer));
    const text = await res.text().catch(() => "");
    return { status: res.status, ok: res.ok, text };
  } catch (error) {
    return { error: String(error) };
  }
}
function report(label: string, result: Probe | { error: string }) {
  if ("error" in result) {
    console.log(`  ${label}: NETWORK ERROR → ${clip(result.error, 200)}`);
    return;
  }
  console.log(`  ${label}: HTTP ${result.status} ${result.ok ? "OK" : "NOT OK"} → ${clip(result.text, 400)}`);
}

async function main() {
  prisma = (await import("@/lib/prisma")).prisma;
  const { getActiveCommunicationRuntimeBundle } = await import("@/lib/communication/runtime-config");
  const runtime = await getActiveCommunicationRuntimeBundle();

  // ---------------------------------------------------------------- runtime config
  head("1. ACTIVE RUNTIME CONFIG (what the campaign sender actually resolves)");

  const netgsm = runtime.netgsm;
  console.log("NETGSM");
  console.log(`  configured : ${netgsm.configured}`);
  if (!netgsm.configured) {
    console.log(`  reason     : ${netgsm.reason}`);
  } else {
    console.log(`  sources    : ${JSON.stringify(netgsm.sources)}`);
    console.log(`  usercode   : ${mask(netgsm.values.usercode)}`);
    console.log(`  password   : ${mask(netgsm.values.password)}`);
    console.log(`  header     : "${netgsm.values.header}"  <-- must match an APPROVED Netgsm sender header exactly`);
    const trailing = /\s$/.test(netgsm.values.usercode) || /\s$/.test(netgsm.values.password) || /\s$/.test(netgsm.values.header);
    const leading = /^\s/.test(netgsm.values.usercode) || /^\s/.test(netgsm.values.password) || /^\s/.test(netgsm.values.header);
    if (trailing || leading) console.log("  !! WARNING: a Netgsm value has leading/trailing whitespace — Basic auth will fail.");
  }

  const email = runtime.elasticEmail;
  console.log("\nELASTIC_EMAIL");
  console.log(`  configured  : ${email.configured}`);
  if (!email.configured) {
    console.log(`  reason      : ${email.reason}`);
  } else {
    console.log(`  sources     : ${JSON.stringify(email.sources)}`);
    console.log(`  apiKey      : ${mask(email.values.apiKey)}`);
    console.log(`  senderEmail : ${email.values.senderEmail}`);
    console.log(`  senderName  : ${email.values.senderName || "(none)"}`);
  }

  // ------------------------------------------------------------------ netgsm probes
  head("2. NETGSM — read-only API probes (no SMS is sent)");
  if (!netgsm.configured) {
    console.log("  skipped: Netgsm is not configured, so the campaign would fail before the HTTP call.");
  } else {
    const auth = `Basic ${Buffer.from(`${netgsm.values.usercode}:${netgsm.values.password}`).toString("base64")}`;
    const headers = { Authorization: auth, accept: "application/json,text/plain" };
    console.log(`  send endpoint the campaign uses: ${NETGSM_SEND_ENDPOINT}`);
    console.log("  These endpoints take the SAME Basic credentials as the send call, so a rejection");
    console.log("  here is a rejection there. Netgsm code 30 = usercode/password wrong OR the account");
    console.log("  has no API access permission; code 40 = the sender header is not approved.\n");

    // The v2 sender-header listing is the most informative probe: it answers with the numeric code
    // AND a description, and it enumerates the approved headers when the credentials are accepted.
    report("v2 headers  GET /sms/rest/v2/msgheader", await probe("https://api.netgsm.com.tr/sms/rest/v2/msgheader", headers));
    report("balance     GET /balance/list/get     ", await probe("https://api.netgsm.com.tr/balance/list/get", headers));

    if (netgsm.values.header.length > 11 || /[^\x20-\x7E]/.test(netgsm.values.header)) {
      console.log(`\n  !! The sender header "${netgsm.values.header}" is ${netgsm.values.header.length} characters` +
        `${/[^\x20-\x7E]/.test(netgsm.values.header) ? " and contains non-ASCII characters" : ""}.`);
      console.log("     Netgsm sender headers are at most 11 characters and must be pre-approved on the");
      console.log("     account, so this value cannot match an approved header even once auth succeeds.");
    }
  }

  // ----------------------------------------------------------- elastic email probes
  head("3. ELASTIC EMAIL — read-only API probes (no email is sent)");
  // When the stored record cannot be decrypted (missing/rotated INTEGRATION_SETTINGS_ENCRYPTION_KEY)
  // the runtime fails closed, but the env fallback key is still enough to interrogate the account —
  // and the account is exactly where the "sent but never arrived" answer lives.
  const emailKey = email.configured ? email.values.apiKey : process.env.ELASTIC_EMAIL_API_KEY?.trim();
  const senderEmail = email.configured ? email.values.senderEmail : process.env.ELASTIC_EMAIL_SENDER_EMAIL?.trim();
  if (!email.configured && emailKey) {
    console.log(`  NOTE: runtime says ${email.reason}; probing with the ELASTIC_EMAIL_API_KEY env fallback instead.\n`);
  }
  if (!emailKey || !senderEmail) {
    console.log("  skipped: no Elastic Email API key available from the database or the environment.");
  } else {
    const headers = { "X-ElasticEmail-ApiKey": emailKey, accept: "application/json" };
    const domain = (senderEmail.split("@")[1] ?? "").toLowerCase();
    console.log(`  sender domain under test: ${domain}`);

    const domains = await probe(`${ELASTIC_BASE}/domains`, headers);
    if ("error" in domains || !domains.ok) {
      report("domains     GET /v4/domains        ", domains);
    } else {
      try {
        const rows = JSON.parse(domains.text) as Array<Record<string, unknown>>;
        // A domain verified for a single sender comes back as "example.org (info@example.org)".
        const match = rows.find((r) => String(r.Domain ?? r.domain ?? "").split("(")[0].trim().toLowerCase() === domain);
        if (!match) {
          console.log(`  !! ${domain} is NOT in the account's domain list — Elastic Email still answers the`);
          console.log("     API call with 2xx (which we record as SENT) and then drops the message.");
        } else {
          for (const flag of ["Domain", "Spf", "Dkim", "MX", "DMARC", "Verify", "DefaultDomain", "TrackingStatus"]) {
            console.log(`    ${flag.padEnd(16)}${JSON.stringify(match[flag])}`);
          }
          if (match.Verify === false) console.log("  !! Verify=false — this sender is not fully verified on the account.");
        }
      } catch {
        console.log("  (could not parse the domain list as JSON)");
      }
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    console.log("");
    report("stats(7d)   GET /v4/statistics     ", await probe(`${ELASTIC_BASE}/statistics?from=${encodeURIComponent(since)}`, headers));
    console.log("     ^ Delivered vs Bounced vs NotDelivered. Accepted-then-not-delivered is the");
    console.log("       signature of an account/trust-level block rather than a bad address.");

    // The decisive probe. /v4/emails/{id}/status wants a TransactionID, but the send response gives
    // us a MessageID (which is what we store), so per-message status lookups always 400. The event
    // feed keys on MsgID and carries the provider's own sentence explaining each outcome.
    head("3b. ELASTIC EMAIL EVENT FEED — the provider's own verdict per recipient");
    const eventsFrom = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const events = await probe(`${ELASTIC_BASE}/events?from=${encodeURIComponent(eventsFrom)}&limit=100`, headers);
    if ("error" in events || !events.ok) {
      report("events      GET /v4/events         ", events);
    } else {
      try {
        const rows = JSON.parse(events.text) as Array<Record<string, unknown>>;
        const ours = rows.filter((r) => String(r.FromEmail ?? "").toLowerCase() === senderEmail.toLowerCase());
        if (!ours.length) console.log(`  (no events in the last 3 days from ${senderEmail})`);
        for (const row of ours.slice(0, 30)) {
          console.log(`  ${String(row.EventDate).replace("T", " ").replace("Z", "")} ${String(row.EventType).padEnd(11)} ` +
            `${String(row.MessageCategory).padEnd(14)} → ${String(row.To).padEnd(32)} ${clip(String(row.Message ?? ""), 160)}`);
        }
      } catch {
        console.log(`  (could not parse the event feed) ${clip(events.text, 300)}`);
      }
    }
  }

  // --------------------------------------------------------------- delivery records
  head("4. RECENT DELIVERY ROWS (what the campaign wrote down)");
  const deliveries = await prisma.communicationDelivery
    .findMany({
      where: { channel: { in: ["SMS", "EMAIL"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        channel: true, provider: true, status: true, errorMessage: true, providerMessageId: true,
        recipientEmail: true, recipientPhone: true, purpose: true, origin: true,
        createdAt: true, sentAt: true, deliveredAt: true, failedAt: true,
      },
    })
    .catch((e) => { console.log(`  query failed: ${e}`); return []; });

  if (!deliveries.length) console.log("  (no SMS/EMAIL delivery rows found)");
  for (const d of deliveries) {
    const to = d.recipientEmail || d.recipientPhone || "—";
    console.log(
      `  ${iso(d.createdAt)} ${String(d.channel).padEnd(5)} ${String(d.provider ?? "—").padEnd(14)} ` +
      `${String(d.status).padEnd(9)} to=${String(to).padEnd(28)} ` +
      `err=${d.errorMessage ?? "—"} msgId=${d.providerMessageId ?? "—"} sent=${iso(d.sentAt)} delivered=${iso(d.deliveredAt)}`,
    );
  }

  const failureCounts = deliveries.reduce<Record<string, number>>((acc, d) => {
    if (d.errorMessage) acc[d.errorMessage] = (acc[d.errorMessage] ?? 0) + 1;
    return acc;
  }, {});
  if (Object.keys(failureCounts).length) console.log(`\n  error tally: ${JSON.stringify(failureCounts)}`);

  // A SENT row that never advanced is not proof of delivery — it is proof that nothing ever came
  // back to contradict it. Elastic Email only reports delivery through the webhook, so if that is
  // not registered on the provider side, every accepted message stays SENT forever.
  const emailSent = deliveries.filter((d) => d.channel === "EMAIL" && d.status === "SENT");
  const emailAdvanced = deliveries.filter((d) => d.channel === "EMAIL" && !!d.deliveredAt);
  if (emailSent.length && !emailAdvanced.length) {
    console.log(`\n  !! ${emailSent.length} EMAIL rows are SENT and NOT ONE has a deliveredAt.`);
    console.log("     SENT here means 'Elastic Email returned 2xx', nothing more. Register the webhook");
    console.log("     at /api/webhooks/elastic-email?token=… so bounces and blocks come back and correct");
    console.log("     these rows — otherwise the dashboard reports success for mail that never landed.");
  }

  // ------------------------------------------------------------------- campaign rows
  head("5. RECENT CAMPAIGNS (status + last run summary)");
  const campaigns = await prisma.communicationCampaign
    .findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, name: true, channel: true, status: true, sentCount: true, failedCount: true, metadata: true, updatedAt: true },
    })
    .catch((e) => { console.log(`  query failed: ${e}`); return []; });

  for (const c of campaigns) {
    const lastRun = (c.metadata as Record<string, unknown> | null)?.lastRun ?? null;
    console.log(`  ${iso(c.updatedAt)} [${c.channel}] ${c.name} — status=${c.status} sent=${c.sentCount} failed=${c.failedCount}`);
    console.log(`      lastRun: ${lastRun ? clip(JSON.stringify(lastRun), 400) : "—"}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma?.$disconnect().catch(() => {});
  process.exit(1);
});
