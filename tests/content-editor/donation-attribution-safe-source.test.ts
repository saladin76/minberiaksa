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
  assert.ok(value);
  assert.doesNotMatch(value, /private-receipt-token|private-oauth-code|#raw-private-value/);
  assert.ok(isPaymentReturnPage(value));
  assert.equal(safeAttributionUrl("javascript:alert(1)"), null);
  assert.equal(safeAttributionUrl("/success?token=secret"), null);
  assert.equal(safeAttributionUrl("https://example.org/ar/?utm_id=97760_v0&token=private"), "https://example.org/ar/?utm_id=97760_v0");
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
