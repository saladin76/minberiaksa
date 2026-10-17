import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapGraphError } from "../../lib/communication/providers/meta-whatsapp/errors";
import {
  ensureWabaSubscriptionForConfig,
  extractSubscribedAppIds,
  WABA_SUBSCRIPTION_REASONS,
} from "../../lib/communication/providers/meta-whatsapp/subscription";
import type { MetaGraphConfig } from "../../lib/communication/providers/meta-whatsapp/types";
import {
  isAdminHeld,
  mergeVerificationMetadata,
  planVerificationFailure,
  planVerificationSuccess,
  VERIFICATION_MESSAGES,
  verificationErrorBody,
} from "../../lib/communication/sender-verification";

/* Reference values from the manual check  test data only, never hard-coded in the code. */
const WABA_ID = "1077508008426130";
const APP_ID = "872208960455201";
const OTHER_APP_ID = "111111111111111";
const ACCESS_TOKEN = "EAAtestTokenValue1234567890abcdefXYZ";

const config = (overrides: Partial<MetaGraphConfig> = {}): MetaGraphConfig => ({
  accessToken: ACCESS_TOKEN,
  graphVersion: "v21.0",
  appId: APP_ID,
  businessPortfolioId: "999",
  appSecret: "app-secret-value-1234",
  verifyToken: "verify-token",
  defaultPhoneNumberId: null,
  businessAccountId: null,
  ...overrides,
});

const appRow = (id: string, name = "Minberi Aksa") => ({ whatsapp_business_api_data: { name, id } });

type Reply = { status?: number; body?: unknown; throws?: boolean };
type Call = { method: string; path: string; authorization: string | null };

/** Scripted Graph API: replies are consumed in order per "METHOD path" (query string ignored). */
function mockGraph(script: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/v[\d.]+\//, "");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method, path: `${path}${url.search}`, authorization: headers.Authorization ?? null });
    const queue = script[`${method} ${path}`];
    const reply = queue?.shift();
    if (!reply) throw new Error(`unexpected Graph call: ${method} ${path}${url.search}`);
    if (reply.throws) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return {
    calls,
    count: (method: string) => calls.filter((c) => c.method === method).length,
    restore: () => { globalThis.fetch = original; },
  };
}

const SUBS = `${WABA_ID}/subscribed_apps`;

async function withGraph<T>(script: Record<string, Reply[]>, run: (graph: ReturnType<typeof mockGraph>) => Promise<T>) {
  const graph = mockGraph(script);
  try {
    return await run(graph);
  } finally {
    graph.restore();
  }
}

/* ── ensureWabaSubscriptionForConfig ───────────────────────────────────────────────────────── */

test("configured app already subscribed: one GET, zero POST, changed:false", async () => {
  await withGraph({ [`GET ${SUBS}`]: [{ body: { data: [appRow(APP_ID)] } }] }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.deepEqual(result, { ok: true, subscribed: true, changed: false, appIds: [APP_ID] });
    assert.equal(graph.count("GET"), 1);
    assert.equal(graph.count("POST"), 0);
  });
});

test("configured app missing: GET → POST → GET, changed:true once the App ID appears", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [] } }, { body: { data: [appRow(APP_ID)] } }],
    [`POST ${SUBS}`]: [{ body: { success: true } }],
  }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.deepEqual(result, { ok: true, subscribed: true, changed: true, appIds: [APP_ID] });
    assert.deepEqual(graph.calls.map((c) => c.method), ["GET", "POST", "GET"]);
  });
});

test("only a different app subscribed is never a success", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [appRow(OTHER_APP_ID, "Other")] } }, { body: { data: [appRow(OTHER_APP_ID, "Other")] } }],
    [`POST ${SUBS}`]: [{ body: { success: true } }],
  }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, WABA_SUBSCRIPTION_REASONS.APP_SUBSCRIPTION_MISMATCH);
      assert.equal(result.retryable, false);
      assert.match(result.detail ?? "", new RegExp(OTHER_APP_ID));
    }
  });
});

test("POST success:true without the configured app appearing is not proof", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [] } }, { body: { data: [] } }],
    [`POST ${SUBS}`]: [{ body: { success: true } }],
  }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, WABA_SUBSCRIPTION_REASONS.APP_SUBSCRIPTION_MISMATCH);
  });
});

test("POST without success:true is reported as unconfirmed, with no follow-up read", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [] } }],
    [`POST ${SUBS}`]: [{ body: { success: false } }],
  }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, WABA_SUBSCRIPTION_REASONS.SUBSCRIBE_NOT_CONFIRMED);
    assert.equal(graph.count("GET"), 1);
  });
});

test("both App ID shapes are read, nested first, and duplicates collapse", () => {
  assert.deepEqual(
    extractSubscribedAppIds([
      appRow(APP_ID),
      { id: APP_ID },
      { id: OTHER_APP_ID },
      { whatsapp_business_api_data: { id: 222 } },
      { whatsapp_business_api_data: { name: "no id" }, id: "333" },
      { whatsapp_business_api_data: { id: " " } },
      {},
    ]),
    [APP_ID, OTHER_APP_ID, "222", "333"],
  );
});

test("top-level row.id alone is accepted as the subscribed app", async () => {
  await withGraph({ [`GET ${SUBS}`]: [{ body: { data: [{ id: APP_ID }] } }] }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok && result.changed, false);
    assert.equal(graph.count("POST"), 0);
  });
});

test("configured app found on a later page: paging followed, still no POST", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [
      { body: { data: [appRow(OTHER_APP_ID, "Other")], paging: { next: "https://graph.facebook.com/next", cursors: { after: "CURSOR_1" } } } },
      { body: { data: [appRow(APP_ID)] } },
    ],
  }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.deepEqual(result, { ok: true, subscribed: true, changed: false, appIds: [OTHER_APP_ID, APP_ID] });
    assert.equal(graph.count("POST"), 0);
    assert.equal(graph.calls[1].path, `${SUBS}?after=CURSOR_1`);
  });
});

test("missing or blank App ID is a configuration error, with no call to Meta", async () => {
  for (const appId of [null, "", "   "]) {
    await withGraph({}, async (graph) => {
      const result = await ensureWabaSubscriptionForConfig(config({ appId }), WABA_ID);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, WABA_SUBSCRIPTION_REASONS.APP_ID_NOT_CONFIGURED);
        assert.equal(result.retryable, false);
      }
      assert.equal(graph.calls.length, 0);
    });
  }
});

test("App ID from settings is trimmed before comparing", async () => {
  await withGraph({ [`GET ${SUBS}`]: [{ body: { data: [appRow(APP_ID)] } }] }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config({ appId: `  ${APP_ID}  ` }), WABA_ID);
    assert.equal(result.ok && result.changed, false);
  });
});

test("first read fails: no POST; network/5xx are retryable, a 400 is not", async () => {
  await withGraph({ [`GET ${SUBS}`]: [{ throws: true }] }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, true);
    assert.equal(graph.count("POST"), 0);
  });
  await withGraph({ [`GET ${SUBS}`]: [{ status: 503, body: { error: { message: "Service unavailable", code: 2 } } }] }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(!result.ok && result.retryable, true);
  });
  await withGraph({ [`GET ${SUBS}`]: [{ status: 400, body: { error: { message: "Unsupported get request", code: 100 } } }] }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, false);
  });
});

test("POST fails: reported with its own reason and no success", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [] } }],
    [`POST ${SUBS}`]: [{ status: 403, body: { error: { message: "Permissions error", code: 200 } } }],
  }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "META_WHATSAPP_UNAUTHORIZED");
      assert.equal(result.retryable, false);
    }
    assert.equal(graph.count("GET"), 1);
  });
});

test("follow-up read fails after a successful POST: failure, not success", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ body: { data: [] } }, { status: 500, body: { error: { message: "Unknown error", code: 1 } } }],
    [`POST ${SUBS}`]: [{ body: { success: true } }],
  }, async () => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, true);
  });
});

test("the access token travels only in the Authorization header and never in a failure detail", async () => {
  await withGraph({
    [`GET ${SUBS}`]: [{ status: 400, body: { error: { message: `Invalid token Bearer ${ACCESS_TOKEN} access_token=${ACCESS_TOKEN}`, code: 100 } } }],
  }, async (graph) => {
    const result = await ensureWabaSubscriptionForConfig(config(), WABA_ID);
    assert.equal(graph.calls[0].authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.ok(!graph.calls[0].path.includes(ACCESS_TOKEN));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(!(result.detail ?? "").includes(ACCESS_TOKEN));
  });
});

test("mapGraphError marks only temporary failures as retryable", () => {
  assert.equal(mapGraphError(500, null).retryable, true);
  assert.equal(mapGraphError(429, null).retryable, true);
  assert.equal(mapGraphError(400, { error: { code: 4, message: "rate" } }).retryable, true);
  assert.equal(mapGraphError(400, { error: { code: 100, is_transient: true } }).retryable, true);
  assert.equal(mapGraphError(400, { error: { code: 100 } }).retryable, false);
  assert.equal(mapGraphError(401, { error: { code: 190 } }).retryable, false);
});

/* ── sender state policy ───────────────────────────────────────────────────────────────────── */

const at = new Date("2026-10-17T10:00:00.000Z");
const healthy = { status: "ACTIVE", enabled: true, metadata: { routingNote: "keep me" } };

test("temporary failure leaves a healthy, verified sender untouched and records the attempt", () => {
  const plan = planVerificationFailure({ stage: "WEBHOOK_SUBSCRIPTION", reason: "META_WHATSAPP_REQUEST_FAILED", detail: "network error", retryable: true }, at);
  assert.equal(plan.kind, "TRANSIENT");
  assert.equal(plan.senderPatch, null);
  assert.equal(plan.httpStatus, 503);
  assert.equal(plan.diagnostic.retryable, true);
  const metadata = mergeVerificationMetadata(healthy, plan.record, false);
  assert.equal(metadata.routingNote, "keep me");
  assert.deepEqual(metadata.verification, {
    lastAttemptAt: at.toISOString(), ok: false, stage: "WEBHOOK_SUBSCRIPTION",
    reason: "META_WHATSAPP_REQUEST_FAILED", detail: "network error", retryable: true,
  });
});

test("temporary failure in the portfolio and ownership stages is equally non-destructive", () => {
  for (const stage of ["BUSINESS_PORTFOLIO", "PHONE_OWNERSHIP"] as const) {
    const plan = planVerificationFailure({ stage, reason: "META_BUSINESS_PORTFOLIO_UNAVAILABLE", retryable: true }, at);
    assert.equal(plan.senderPatch, null);
    assert.equal(plan.diagnostic.stage, stage);
  }
});

test("PROVIDER_DISABLED is an internal state: own message, CONFIGURATION stage, sender untouched", () => {
  const plan = planVerificationFailure({ stage: "BUSINESS_PORTFOLIO", reason: "PROVIDER_DISABLED" }, at);
  assert.equal(plan.kind, "PROVIDER_DISABLED");
  assert.equal(plan.error, "مزود Meta WhatsApp غير مفعّل داخل النظام");
  assert.equal(plan.diagnostic.stage, "CONFIGURATION");
  assert.equal(plan.senderPatch, null);
  assert.notEqual(plan.error, VERIFICATION_MESSAGES.APP_SUBSCRIPTION);
});

test("confirmed ownership failures take the sender out of routing with stage and reason", () => {
  const portfolio = planVerificationFailure({ stage: "BUSINESS_PORTFOLIO", reason: "META_WABA_NOT_IN_BUSINESS_PORTFOLIO", detail: "WABA x is not owned" }, at);
  assert.equal(portfolio.kind, "OWNERSHIP");
  assert.deepEqual(portfolio.senderPatch, {
    status: "NEEDS_ATTENTION", enabled: false, lastHealthCheckAt: at,
    lastError: "BUSINESS_PORTFOLIO · META_WABA_NOT_IN_BUSINESS_PORTFOLIO · WABA x is not owned",
  });
  const phone = planVerificationFailure({ stage: "PHONE_OWNERSHIP", reason: "META_WHATSAPP_PHONE_NOT_IN_WABA" }, at);
  assert.equal(phone.kind, "OWNERSHIP");
  assert.equal(phone.error, VERIFICATION_MESSAGES.PHONE_OWNERSHIP);
  assert.equal(phone.senderPatch?.enabled, false);
});

test("app subscription mismatch is its own kind, distinct from missing settings", () => {
  const mismatch = planVerificationFailure({ stage: "WEBHOOK_SUBSCRIPTION", reason: "META_WABA_APP_SUBSCRIPTION_MISMATCH" }, at);
  assert.equal(mismatch.kind, "APP_SUBSCRIPTION");
  assert.equal(mismatch.senderPatch?.status, "NEEDS_ATTENTION");
  const noAppId = planVerificationFailure({ stage: "WEBHOOK_SUBSCRIPTION", reason: "META_WHATSAPP_APP_ID_NOT_CONFIGURED" }, at);
  assert.equal(noAppId.kind, "CONFIGURATION_MISSING");
  assert.equal(noAppId.diagnostic.stage, "CONFIGURATION");
  assert.equal(noAppId.senderPatch?.status, "NOT_CONFIGURED");
});

test("settings database unreachable is temporary and non-destructive", () => {
  const plan = planVerificationFailure({ stage: "BUSINESS_PORTFOLIO", reason: "INTEGRATION_DATABASE_UNAVAILABLE" }, at);
  assert.equal(plan.senderPatch, null);
  assert.equal(plan.diagnostic.retryable, true);
});

test("success activates a sender that verification itself had taken out of routing", () => {
  const plan = planVerificationSuccess({ status: "NEEDS_ATTENTION", enabled: false, metadata: null }, at, "GREEN");
  assert.deepEqual(plan.senderPatch, { status: "ACTIVE", enabled: true, lastError: null, lastHealthCheckAt: at });
  assert.equal(plan.adminHeld, false);
  assert.equal(plan.message, VERIFICATION_MESSAGES.VERIFIED);
});

test("success never re-enables an operator's deliberate disable", () => {
  const explicit = { status: "ACTIVE", enabled: false, metadata: { adminDisabled: true } };
  assert.equal(planVerificationSuccess(explicit, at, null).senderPatch.enabled, false);
  const inferred = { status: "ACTIVE", enabled: false, metadata: null };
  assert.equal(planVerificationSuccess(inferred, at, null).senderPatch.enabled, false);
  const disabledStatus = { status: "DISABLED", enabled: false, metadata: null };
  const held = planVerificationSuccess(disabledStatus, at, null);
  assert.equal(held.senderPatch.status, "DISABLED");
  assert.equal(held.senderPatch.enabled, false);
  assert.equal(held.message, VERIFICATION_MESSAGES.VERIFIED_ADMIN_HOLD);
  /* An operator who switched it back on is not held. */
  assert.equal(isAdminHeld({ status: "NEEDS_ATTENTION", enabled: false, metadata: { adminDisabled: false } }), false);
});

test("an inferred operator disable survives a confirmed failure that overwrites the status", () => {
  const sender = { status: "ACTIVE", enabled: false, metadata: null };
  const plan = planVerificationFailure({ stage: "PHONE_OWNERSHIP", reason: "META_WHATSAPP_PHONE_NOT_IN_WABA" }, at);
  const metadata = mergeVerificationMetadata(sender, plan.record, true);
  assert.equal(metadata.adminDisabled, true);
  const after = { status: plan.senderPatch!.status!, enabled: false, metadata };
  assert.equal(planVerificationSuccess(after, at, null).senderPatch.enabled, false);
});

test("RED quality is a warning on success, never a verification failure", () => {
  const plan = planVerificationSuccess({ status: "ACTIVE", enabled: true, metadata: null }, at, "RED");
  assert.equal(plan.senderPatch.status, "ACTIVE");
  assert.equal(plan.senderPatch.enabled, true);
  assert.deepEqual(plan.warnings, ["QUALITY_RATING_RED"]);
});

test("the API error body keeps `error` and adds stage / reason / detail / retryable", () => {
  const plan = planVerificationFailure({ stage: "WEBHOOK_SUBSCRIPTION", reason: "META_WABA_APP_SUBSCRIPTION_MISMATCH", detail: "app missing" }, at);
  assert.deepEqual(verificationErrorBody(plan.error, plan.diagnostic), {
    error: VERIFICATION_MESSAGES.APP_SUBSCRIPTION,
    stage: "WEBHOOK_SUBSCRIPTION",
    reason: "META_WABA_APP_SUBSCRIPTION_MISMATCH",
    detail: "app missing",
    retryable: false,
  });
  assert.deepEqual(verificationErrorBody("Sender not found."), { error: "Sender not found." });
});

/* ── wiring: service → route → dashboard ───────────────────────────────────────────────────── */

const read = (path: string) => readFileSync(path, "utf8");

test("verifyWhatsappSender routes every stage through the shared failure policy", () => {
  const source = read("lib/communication/sender-service.ts");
  for (const stage of ["BUSINESS_PORTFOLIO", "PHONE_OWNERSHIP", "WEBHOOK_SUBSCRIPTION"]) {
    assert.match(source, new RegExp(`fail\\(\\{ stage: "${stage}"`));
  }
  assert.match(source, /planVerificationSuccess\(/);
  assert.match(source, /plan\.senderPatch \? \{ \.\.\.plan\.senderPatch, metadata \} : \{ metadata \}/);
  /* The old blanket disable on every failure is gone. */
  assert.doesNotMatch(source, /status: "NEEDS_ATTENTION",\s*enabled: false,\s*lastHealthCheckAt: checkedAt/);
  assert.doesNotMatch(source, /WABA_WEBHOOK_SUBSCRIPTION_FAILED/);
});

test("the client no longer POSTs unconditionally", () => {
  const client = read("lib/communication/providers/meta-whatsapp/client.ts");
  assert.match(client, /ensureWabaSubscriptionForConfig\(resolved\.values, businessAccountId\)/);
  assert.doesNotMatch(client, /POSTing is cheap and\s*\n?\s*\*?\s*idempotent/);
  assert.doesNotMatch(client, /method: "POST"/);
});

test("the verify route returns the structured diagnostic and the dashboard shows it", () => {
  const route = read("app/api/dashboard/communication/senders/[id]/verify/route.ts");
  assert.match(route, /verificationErrorBody\(result\.error, result\.diagnostic\)/);
  assert.match(route, /warnings: result\.warnings/);
  const ui = read("app/(dashboard)/dashboard/platform-connections/communication/_components/SenderRoutingManager.tsx");
  assert.match(ui, /verifyFailureLines\(body\)/);
  for (const field of ["body.stage", "body.reason", "body.detail", "body.retryable"]) assert.ok(ui.includes(field), field);
  assert.match(ui, /QUALITY_RATING_RED/);
});
