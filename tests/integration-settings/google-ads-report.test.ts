import test from "node:test";
import assert from "node:assert/strict";
import { fetchGoogleAdsReport, GoogleAdsReportError, type GoogleAdsCredentials } from "../../lib/marketing/google-ads-report";
const credentials: GoogleAdsCredentials = { customerId: "123-456-7890", managerId: "999-888-7777", developerToken: "test-developer", clientId: "test-client", clientSecret: "test-secret", refreshToken: "test-refresh" };

test("Google Ads reads fixed, bounded SELECT reports using account dates and never returns credentials", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = String(init.body); calls.push({ url, body });
    if (url.includes("oauth2")) return Response.json({ access_token: "test-access" });
    const query = JSON.parse(body).query as string;
    assert.match(url, /\/v26\/customers\/1234567890\/googleAds:search$/);
    assert.equal((init.headers as Record<string, string>)["login-customer-id"], "9998887777");
    assert.match(query, /^SELECT /); assert.ok(!/mutate/i.test(url));
    if (query.includes("FROM customer")) return Response.json({ results: [{ customer: { currencyCode: "TRY", timeZone: "Europe/Istanbul" } }] });
    assert.match(query, /BETWEEN '2026-10-26' AND '2026-10-26'/);
    const metric = { impressions: "100", clicks: "10", costMicros: "2500000", conversions: 1.5, conversionsValue: 7 };
    return Response.json({ results: [{ campaign: { name: "Gaza" }, adGroupCriterion: { keyword: { text: "Donate bread", matchType: "EXACT" } }, searchTermView: { searchTerm: "bread charity" }, metrics: metric }] });
  }) as typeof fetch;
  const result = await fetchGoogleAdsReport(credentials, { range: "today" }, fetcher, new Date("2026-10-25T22:05:00Z"));
  assert.equal(calls.length, 5); assert.equal(result.keywords[0].cost, 2.5); assert.equal(result.keywords[0].conversions, 1.5);
  assert.equal(result.searchTerms[0].label, "bread charity"); assert.equal(result.currency, "TRY");
  for (const secret of [credentials.developerToken, credentials.clientSecret, credentials.refreshToken, "test-access"]) assert.ok(!JSON.stringify(result).includes(secret));
});

test("invalid Ads configuration and untrusted date input cause zero network calls", async () => {
  const fetcher = (async () => { throw new Error("must not call"); }) as typeof fetch;
  await assert.rejects(fetchGoogleAdsReport({ ...credentials, customerId: "invalid/../../" }, { range: "28d" }, fetcher), /GOOGLE_ADS_CONFIG_INVALID/);
  await assert.rejects(fetchGoogleAdsReport(credentials, { range: "custom", startDate: "2026-01-01' OR 1=1", endDate: "2026-01-02" }, fetcher), /GA4_PERIOD_INVALID/);
});

test("Ads auth and permission failures are explicit and suppress upstream bodies and tokens", async () => {
  const denied = (async (url: string) => url.includes("oauth2") ? Response.json({ access_token: "private" }) : Response.json({ error: "private-account-details" }, { status: 403 })) as typeof fetch;
  await assert.rejects(fetchGoogleAdsReport(credentials, { range: "28d" }, denied), (error: unknown) => error instanceof GoogleAdsReportError && error.code === "GOOGLE_ADS_ACCESS_DENIED" && !error.message.includes("private"));
  const auth = (async () => Response.json({ error: "private-refresh-details" }, { status: 400 })) as typeof fetch;
  await assert.rejects(fetchGoogleAdsReport(credentials, { range: "28d" }, auth), /GOOGLE_ADS_AUTH_FAILED/);
});
