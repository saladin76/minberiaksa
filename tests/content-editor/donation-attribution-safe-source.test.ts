import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeAttributionUrl, isPaymentReturnPage, safeAcquisitionLandingPage, sanitizeDonationAttribution } from "../../lib/attribution/sanitize";
import { detectDonationSource } from "../../lib/attribution/detect-source";
import { resolveAttribution } from "../../lib/tracking/attribution-resolver";

const success = "https://minberiaksa.org/ar/success/6ae6c4ba1deaf72888498661?t=private-receipt-token&code=private-oauth-code";
const first = "https://minberiaksa.org/ar/?utm_id=97760_v0&utm_source=instagram&utm_medium=social";
const instagram = "https://l.instagram.com/";

test("receipt tokens, credentials and hashes never survive attribution URL sanitization", () => {
  const value = safeAttributionUrl(success + "#raw-private-value");
  assert.equal(value, null, "private success/receipt URLs are not eligible for attribution or Meta CAPI");
  assert.ok(isPaymentReturnPage(success), "return-page detection inspects original URL path");
  assert.equal(safeAttributionUrl("javascript:alert(1)"), null);
  assert.equal(safeAttributionUrl("/success?token=secret"), null);
  assert.equal(safeAttributionUrl("https://example.org/ar/?utm_id=97760_v0&token=private"), "https://example.org/ar/?utm_id=97760_v0");

  // Route-embedded secrets cannot be stripped safely; the entire URL is rejected.
  for (const path of [
    "/ar/success/6ae6c4ba1deaf72888498661",
    "/ar/receipt/guest-secret",
    "/ar/receipts/guest-secret",
    "/ar/certificate/guest-secret",
    "/ar/auth/verify/guest-secret",
    "/ar/download/opaque-secret",
    "/ar/%72eceipt/guest-secret",
    "/ar/%2572eceipt/guest-secret",
    "/ar/projects/eyJhbGciOiJIUzI1NiJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0abcdef12345",
    "/ar/projects/abcdefghijklmnopqrstuvwxyz0123456789",
  ]) {
    assert.equal(safeAttributionUrl(`https://minberiaksa.org${path}?utm_campaign=winter&fbclid=known`), null, path);
  }
  assert.equal(safeAttributionUrl("https://minberiaksa.org/ar/projects/winter-2026?utm_source=google&utm_campaign=winter&gclid=click"),
    "https://minberiaksa.org/ar/projects/winter-2026?utm_source=google&utm_campaign=winter&gclid=click");
  assert.equal(safeAcquisitionLandingPage({ landing_page: "https://minberiaksa.org/ar/receipt/guest-secret", first_landing_page: first }), first);
  assert.equal(safeAcquisitionLandingPage({ landing_page: "https://minberiaksa.org/ar/receipt/guest-secret" }), null);


  // Query names are untrusted: denylist-only sanitizers miss aliases and new tokens.
  for (const key of ["receiptToken", "guest_token", "id_token", "authKey", "sessionId", "privateCredential", "unknown_param", "utm_receipt_token"]) {
    const input = new URL("https://minberiaksa.org/ar/?utm_source=instagram&fbclid=click123");
    input.searchParams.set(key, "secret-synthetic-value");
    const safe = safeAttributionUrl(input.toString());
    assert.ok(safe);
    assert.doesNotMatch(safe, /secret-synthetic-value/);
    assert.equal(new URL(safe).searchParams.get("utm_source"), "instagram");
    assert.equal(new URL(safe).searchParams.get("fbclid"), "click123");
  }
  const campaign = "https://minberiaksa.org/ar/?utm_source=google&utm_medium=cpc&utm_campaign=winter&utm_id=123&gclid=click&id_token=secret";
  assert.equal(safeAttributionUrl(campaign), "https://minberiaksa.org/ar/?utm_source=google&utm_medium=cpc&utm_campaign=winter&utm_id=123&gclid=click");
  assert.equal(safeAcquisitionLandingPage({ landing_page: campaign }),
    "https://minberiaksa.org/ar/?utm_source=google&utm_medium=cpc&utm_campaign=winter&utm_id=123&gclid=click");

});

test("acquisition landing must be the original page, not success / bank return", () => {
  const attr = { landing_page: success, first_landing_page: first, first_referrer: instagram };
  assert.equal(safeAcquisitionLandingPage(attr), first);
  assert.equal(safeAcquisitionLandingPage({ landing_page: success }), null);
  assert.equal(safeAcquisitionLandingPage({ landing_page: "https://epos.albarakaturk.com.tr/path" }), null);
  assert.equal(safeAcquisitionLandingPage({ landing_page: first }), first);
  const sanitized = sanitizeDonationAttribution(attr) as Record<string, unknown>;
  assert.equal(sanitized.landing_page, first);
  assert.equal(sanitized.first_landing_page, first);
  assert.doesNotMatch(JSON.stringify(sanitized), /private-receipt-token|private-oauth-code/);
});

test("Instagram referrer alone is observed referral, NEVER evidence of paid advertising", () => {
  const attr = { first_referrer: instagram, source_capture: "referrer", first_landing_page: first.split("?")[0] };
  const input = { attribution: attr, status: "PAID", conversionEventsSentAt: null, conversionFailedEventsSentAt: null };
  const badge = detectDonationSource(input);
  const reporting = resolveAttribution(input);
  assert.equal(badge.sourceKind, "referral");
  assert.match(badge.sourceLabel, /Instagram/);
  assert.equal(badge.platform, "organic");
  assert.equal(badge.status, "organic");
  assert.equal(reporting.paidEvidence, false);
  assert.notEqual(reporting.status, "verified");
});

test("financial conversion events must use redacted acquisition URLs", () => {
  const runtime = readFileSync("lib/tracking/donation-conversion-server.ts", "utf8");
  assert.match(runtime, /safeAcquisitionLandingPage\(attribution \?\? null\)/);
  assert.doesNotMatch(runtime, /eventSourceUrl = getStr\(attribution, "landing_page"\)/);
  const dialog = readFileSync("components/dashboard/DonationDetailsDialog.tsx", "utf8");
  assert.match(dialog, /safeAttributionUrl\(String\(raw\)\)/);
  assert.match(dialog, /safeAcquisitionLandingPage\(attr\)/);
  const capture = readFileSync("lib/attribution/client-payload.ts", "utf8");
  assert.match(capture, /isPaymentReturnPage\(currentUrl\)/);
});
