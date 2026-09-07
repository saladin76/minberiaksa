import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  BrevoConnectionTester,
  ElasticEmailConnectionTester,
  MetaWhatsAppConnectionTester,
  NetgsmConnectionTester,
  SystemCronConnectionTester,
} from "../../lib/integration-settings/provider-testing";
import type { ProviderFetch } from "../../lib/integration-settings/provider-testing/http";

function response(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": typeof body === "string" ? "text/plain" : "application/json" },
  });
}

const metaValues = {
  ACCESS_TOKEN: "valid-meta-access-token-for-testing-123456",
  APP_SECRET: "0123456789abcdef0123456789abcdef",
  WEBHOOK_VERIFY_TOKEN: "local-webhook-verify-token-123456",
  GRAPH_API_VERSION: "v23.0",
  BUSINESS_ACCOUNT_ID: "123",
  DEFAULT_PHONE_NUMBER_ID: "456",
};

function expectedProof(values = metaValues): string {
  return createHmac("sha256", values.APP_SECRET).update(values.ACCESS_TOKEN).digest("hex");
}

test("Meta tester validates app secret proof, WABA and phone relationship without sending a message", async () => {
  const calls: string[] = [];
  const proof = expectedProof();
  const fakeFetch: ProviderFetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("appsecret_proof=") && !url.includes(`appsecret_proof=${proof}`)) return response(400, { error: { code: 100 } });
    if (url.includes("/123/phone_numbers")) return response(200, { data: [{ id: "456" }] });
    if (url.includes("/456?")) return response(200, { id: "456", verified_name: "Gozbebekleri" });
    return response(200, { id: "123", name: "Gozbebekleri" });
  };
  const result = await new MetaWhatsAppConnectionTester(fakeFetch).test({
    provider: "META_WHATSAPP",
    candidateVersion: "candidate",
    values: metaValues,
  });
  assert.equal(result.success, true);
  assert.equal(calls.length, 4);
  assert.equal(calls.some((url) => url.endsWith("/messages")), false);
  assert.equal(calls.filter((url) => url.includes("appsecret_proof=")).length, 3);
  assert.match(result.messageAr, /توافق App Secret/);
  assert.match(result.messageAr, /صالح محليًا/);
  assert.doesNotMatch(result.messageAr, /تحققت Meta من.*Webhook/i);
  const safe = JSON.stringify(result);
  assert.equal(safe.includes(metaValues.ACCESS_TOKEN), false);
  assert.equal(safe.includes(metaValues.APP_SECRET), false);
  assert.equal(safe.includes(proof), false);
});

test("Meta tester fails when app secret proof does not match a valid access token", async () => {
  const correctSecret = "fedcba9876543210fedcba9876543210";
  const acceptedProof = createHmac("sha256", correctSecret).update(metaValues.ACCESS_TOKEN).digest("hex");
  const observedUrls: string[] = [];
  const fakeFetch: ProviderFetch = async (input) => {
    const url = String(input);
    observedUrls.push(url);
    if (!url.includes("appsecret_proof=")) return response(200, { id: "123" });
    return url.includes(`appsecret_proof=${acceptedProof}`) ? response(200, { id: "123" }) : response(400, { error: { code: 100 } });
  };
  const result = await new MetaWhatsAppConnectionTester(fakeFetch).test({
    provider: "META_WHATSAPP",
    candidateVersion: "candidate",
    values: metaValues,
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_APP_SECRET_MISMATCH");
  assert.equal(observedUrls.length, 2);
  const safe = JSON.stringify(result);
  assert.equal(safe.includes(metaValues.ACCESS_TOKEN), false);
  assert.equal(safe.includes(metaValues.APP_SECRET), false);
  assert.equal(safe.includes(expectedProof()), false);
});

test("Meta tester rejects an invalid access token before app secret proof validation", async () => {
  const calls: string[] = [];
  const fakeFetch: ProviderFetch = async (input) => {
    calls.push(String(input));
    return response(401, { error: { code: 190 } });
  };
  const result = await new MetaWhatsAppConnectionTester(fakeFetch).test({
    provider: "META_WHATSAPP",
    candidateVersion: null,
    values: metaValues,
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_UNAUTHORIZED");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.includes("appsecret_proof="), false);
});

test("Meta tester rejects a phone number outside the configured business account", async () => {
  const fakeFetch: ProviderFetch = async (input) => {
    const url = String(input);
    if (url.includes("phone_numbers")) return response(200, { data: [{ id: "999" }] });
    return response(200, { id: "123" });
  };
  const result = await new MetaWhatsAppConnectionTester(fakeFetch).test({
    provider: "META_WHATSAPP",
    candidateVersion: null,
    values: metaValues,
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_PHONE_NUMBER_MISMATCH");
});

test("Meta tester requires a locally valid webhook verify token", async () => {
  let called = false;
  const fakeFetch: ProviderFetch = async () => { called = true; return response(200, {}); };
  const result = await new MetaWhatsAppConnectionTester(fakeFetch).test({
    provider: "META_WHATSAPP",
    candidateVersion: null,
    values: { ...metaValues, WEBHOOK_VERIFY_TOKEN: "bad token" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "META_WEBHOOK_VERIFY_TOKEN_INVALID");
  assert.equal(called, false);
  assert.match(result.messageAr, /محليًا/);
});

test("Brevo tester validates the SMS account without sending and without touching email endpoints", async () => {
  const calls: string[] = [];
  const fakeFetch: ProviderFetch = async (input) => {
    calls.push(String(input));
    return response(200, { email: "account@example.org" });
  };
  const result = await new BrevoConnectionTester(fakeFetch).test({
    provider: "BREVO",
    candidateVersion: null,
    values: { API_KEY: "key", SMS_SENDER: "GOZBEBEK" },
  });
  assert.equal(result.success, true);
  assert.deepEqual(calls, ["https://api.brevo.com/v3/account"]);
  assert.equal(calls.some((url) => url.includes("/senders") || url.includes("/smtp")), false);
});

test("Brevo tester records provider authentication failure safely", async () => {
  const fakeFetch: ProviderFetch = async () => response(401, { code: "unauthorized" });
  const result = await new BrevoConnectionTester(fakeFetch).test({
    provider: "BREVO",
    candidateVersion: null,
    values: { API_KEY: "secret-api-key", SMS_SENDER: "GOZBEBEK" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "BREVO_UNAUTHORIZED");
  assert.equal(JSON.stringify(result).includes("secret-api-key"), false);
});

test("Elastic Email tester confirms the sender domain is verified without sending", async () => {
  const calls: string[] = [];
  const fakeFetch: ProviderFetch = async (input) => {
    calls.push(String(input));
    return response(200, [{ Domain: "yedicihan.org.tr", Spf: true, Dkim: true }]);
  };
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, true);
  assert.deepEqual(calls, ["https://api.elasticemail.com/v4/domains"]);
  assert.equal(calls.some((url) => url.includes("/emails")), false);
});

test("Elastic Email tester accepts a domain verified for one sender address", async () => {
  // Real response shape from the live account: a sender-scoped verification carries the address
  // inline, which an exact string compare against the bare domain can never match.
  const fakeFetch: ProviderFetch = async () =>
    response(200, [{ Domain: "yedicihan.org.tr (info@yedicihan.org.tr)", Spf: true, Dkim: true }]);
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "info@yedicihan.org.tr" },
  });
  assert.equal(result.success, true);
});

test("Elastic Email tester fails when the sender domain is not verified", async () => {
  const fakeFetch: ProviderFetch = async () => response(200, [{ Domain: "other-domain.org" }]);
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "ELASTIC_EMAIL_SENDER_DOMAIN_NOT_VERIFIED");
});

test("Elastic Email tester reports an invalid key without leaking it", async () => {
  const fakeFetch: ProviderFetch = async () => response(401, { Error: "unauthorized" });
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-secret-key-value-000", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "ELASTIC_EMAIL_UNAUTHORIZED");
  assert.equal(JSON.stringify(result).includes("elastic-secret-key-value-000"), false);
});

test("Elastic Email tester tolerates a send-scoped key that cannot list domains", async () => {
  const fakeFetch: ProviderFetch = async () => response(403, { Error: "insufficient scope" });
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, true);
  assert.match(result.messageAr, /لم يتم التحقق من توثيق نطاق المرسل/);
});

// The two cases below use the responses the live Elastic Email v4 API actually returns.
// It answers every auth problem with HTTP 400 and never 401/403, so a tester that keys off
// the status code alone reads a healthy send-only key as a dead account — which is exactly
// what surfaced on /dashboard/platform-connections/communication.
test("Elastic Email tester treats HTTP 400 'Access Denied' as a scope limit, not a dead account", async () => {
  const fakeFetch: ProviderFetch = async () => response(400, { Error: "Access Denied." });
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, true);
  assert.match(result.messageAr, /لم يتم التحقق من توثيق نطاق المرسل/);
});

test("Elastic Email tester reports HTTP 400 'APIKey Expired' as an invalid key", async () => {
  const fakeFetch: ProviderFetch = async () => response(400, { Error: "APIKey Expired" });
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "ELASTIC_EMAIL_UNAUTHORIZED");
});

test("Elastic Email tester still fails loudly on a genuine server error", async () => {
  const fakeFetch: ProviderFetch = async () => response(500, { Error: "Internal Server Error" });
  const result = await new ElasticEmailConnectionTester(fakeFetch).test({
    provider: "ELASTIC_EMAIL",
    candidateVersion: null,
    values: { API_KEY: "elastic-api-key-1234567890", SENDER_EMAIL: "noreply@yedicihan.org.tr" },
  });
  assert.equal(result.success, false);
  assert.equal(result.failureCode, "ELASTIC_EMAIL_ACCOUNT_UNAVAILABLE");
});

test("Netgsm tester checks account and header without sending SMS", async () => {
  const calls: string[] = [];
  const fakeFetch: ProviderFetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return url.includes("/header") ? response(200, { headers: ["GOZBEBEK"] }) : response(200, "100.00");
  };
  const result = await new NetgsmConnectionTester(fakeFetch).test({
    provider: "NETGSM",
    candidateVersion: null,
    values: { USERCODE: "user", PASSWORD: "password", HEADER: "GOZBEBEK" },
  });
  assert.equal(result.success, true);
  assert.equal(calls.some((url) => url.includes("/send")), false);
});

test("System Cron tester validates the decrypted candidate locally", async () => {
  const tester = new SystemCronConnectionTester();
  const success = await tester.test({ provider: "SYSTEM", candidateVersion: null, values: { CRON_SECRET: "secure-cron-secret-that-is-at-least-thirty-two-characters" } });
  const failedResult = await tester.test({ provider: "SYSTEM", candidateVersion: null, values: { CRON_SECRET: "weak" } });
  assert.equal(success.success, true);
  assert.equal(failedResult.success, false);
  assert.equal(JSON.stringify(success).includes("secure-cron-secret"), false);
});
