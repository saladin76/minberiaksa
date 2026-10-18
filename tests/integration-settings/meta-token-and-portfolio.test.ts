import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MetaWhatsAppConnectionTester } from "../../lib/integration-settings/provider-testing";
import type { ProviderFetch } from "../../lib/integration-settings/provider-testing/http";

const values = {
  ACCESS_TOKEN: "valid-meta-access-token-for-testing-123456",
  APP_ID: "872208960455201",
  APP_SECRET: "0123456789abcdef0123456789abcdef",
  BUSINESS_PORTFOLIO_ID: "118938273925574",
  WEBHOOK_VERIFY_TOKEN: "local-webhook-verify-token-123456",
  GRAPH_API_VERSION: "v23.0",
};
const proof = createHmac("sha256", values.APP_SECRET).update(values.ACCESS_TOKEN).digest("hex");
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* Meta as observed on 2026-10-18: a user token with WhatsApp scopes but no business_management. */
function meta(token: { expiresAt: number; scopes?: string[] }, ownedStatus = 403): { fetch: ProviderFetch; calls: string[] } {
  const calls: string[] = [];
  const fetch: ProviderFetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/debug_token")) {
      return json(200, {
        data: {
          app_id: values.APP_ID,
          type: "USER",
          is_valid: true,
          expires_at: token.expiresAt,
          scopes: token.scopes ?? ["whatsapp_business_management", "whatsapp_business_messaging", "public_profile"],
        },
      });
    }
    if (url.includes("appsecret_proof=") && !url.includes(`appsecret_proof=${proof}`)) return json(400, { error: { code: 100 } });
    if (url.includes("/owned_whatsapp_business_accounts")) {
      return ownedStatus === 200
        ? json(200, { data: [{ id: "1077508008426130", name: "Minberi Aksa" }] })
        : json(ownedStatus, { error: { code: 200, message: "(#200) Requires business_management permission to manage the object" } });
    }
    if (url.includes(`/${values.BUSINESS_PORTFOLIO_ID}?fields=id,name`)) return json(200, { id: values.BUSINESS_PORTFOLIO_ID, name: "Minberi Aksa" });
    return json(200, { id: "532869006306152", name: "Admin" });
  };
  return { fetch, calls };
}

const inDays = (days: number) => Math.floor(Date.now() / 1000) + days * 86_400;
const run = (fetch: ProviderFetch) =>
  new MetaWhatsAppConnectionTester(fetch).test({ provider: "META_WHATSAPP", candidateVersion: "candidate", values });

test("a token expiring within 72 hours is refused before anything else, with its own code", async () => {
  const { fetch, calls } = meta({ expiresAt: inDays(0.01) });
  const result = await run(fetch);
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_TOKEN_EXPIRING");
  assert.equal(calls.some((url) => url.includes("owned_whatsapp_business_accounts")), false);
  assert.equal(JSON.stringify(result).includes(values.APP_SECRET), false);
});

test("a never-expiring token (expires_at 0) passes the expiry check", async () => {
  const { fetch } = meta({ expiresAt: 0 }, 200);
  const result = await run(fetch);
  assert.equal(result.success, true);
  assert.match(result.messageAr, /1 حساب WABA/);
});

test("a token without the WhatsApp permissions is refused", async () => {
  const { fetch } = meta({ expiresAt: 0, scopes: ["ads_read", "public_profile"] });
  const result = await run(fetch);
  assert.equal(result.failureCode, "META_TOKEN_MISSING_WHATSAPP_SCOPES");
});

test("missing business_management is a note, not a portfolio failure", async () => {
  const { fetch } = meta({ expiresAt: inDays(60) }, 403);
  const result = await run(fetch);
  assert.equal(result.success, true);
  assert.match(result.messageAr, /business_management/);
});

test("a server error listing the WABAs is reported as such, not as an unreachable portfolio", async () => {
  const { fetch } = meta({ expiresAt: 0 }, 500);
  const result = await run(fetch);
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_BUSINESS_WABAS_UNAVAILABLE");
});

test("the debug_token call authenticates with the app token in a header, never in the URL", async () => {
  const { fetch, calls } = meta({ expiresAt: 0 }, 200);
  await run(fetch);
  const debug = calls.find((url) => url.includes("/debug_token"))!;
  assert.equal(debug.includes(values.APP_SECRET), false);
});

test("sender verification falls back to the WABA's owner when business_management is missing", () => {
  const source = readFileSync("lib/communication/providers/meta-whatsapp/client.ts", "utf8");
  assert.match(source, /fields=id,name,owner_business_info/);
  assert.match(source, /assets\.reason !== BUSINESS_MANAGEMENT_PERMISSION_MISSING/);
  assert.match(source, /ownerId === businessId/);
});

test("every new failure code has a dashboard label", () => {
  const ui = readFileSync("lib/integration-settings/ui.ts", "utf8");
  for (const code of ["META_TOKEN_EXPIRING", "META_TOKEN_MISSING_WHATSAPP_SCOPES", "META_BUSINESS_WABAS_UNAVAILABLE"]) {
    assert.match(ui, new RegExp(`get ${code}\\(\\)`));
  }
});
