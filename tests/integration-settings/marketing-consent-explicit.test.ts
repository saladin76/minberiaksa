import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readMarketingConsent } from "../../lib/tracking/marketing-consent";

test("missing marketing consent is denied without impacting checkout", () => {
  const navigation = { doNotTrack: null, globalPrivacyControl: false };
  assert.equal(readMarketingConsent("", navigation), "missing");
  assert.equal(readMarketingConsent("analytics_consent=granted", navigation), "granted");
  assert.equal(readMarketingConsent("analytics_consent=denied", navigation), "denied");
  assert.equal(readMarketingConsent("analytics_consent=denied; tracking_consent=granted", navigation), "denied");
  assert.equal(readMarketingConsent("tracking_consent=denied; analytics_consent=granted", navigation), "denied");
  assert.equal(readMarketingConsent("analytics_consent=granted", { doNotTrack: "1" }), "denied");
  assert.equal(readMarketingConsent("analytics_consent=granted", { doNotTrack: null, globalPrivacyControl: true }), "denied");
  assert.equal(readMarketingConsent("analytics_consent=garbage", navigation), "missing");
});

test("marketing pixels and tracking proxy require explicit consent; settlement stays separate", () => {
  const pixel = readFileSync("components/TrackingPixels.tsx", "utf8");
  assert.match(pixel, /if \(!hasMarketingConsent\(\)\) return;/);
  assert.match(pixel, /if \(!config \|\| !hasMarketingConsent\(\)\) return;/);
  const server = readFileSync("app/api/track/route.ts", "utf8");
  assert.match(server, /readMarketingConsent\(req\.headers\.get\("cookie"\)/);
  assert.match(server, /marketing consent required/);
  assert.match(server, /cross-site tracking rejected/);
  const success = readFileSync("components/SuccessFinalConversionTracker.tsx", "utf8");
  assert.match(success, /hasMarketingConsent\(\)/);
  const fraud = readFileSync("app/api/donations/[id]/track-conversion/route.ts", "utf8");
  assert.match(fraud, /row\.status !== "PAID" \|\| row\.paidAt == null/);
});

test("consent UI has deliberate allow/decline/reopen and Clarity enforces choice", () => {
  const banner = readFileSync("components/MarketingConsentBanner.tsx", "utf8");
  assert.match(banner, /setMarketingConsent\(value\)/);
  assert.match(banner, /window\.location\.reload\(\)/);
  assert.match(banner, /setOpen\(true\)/);
  const clarity = readFileSync("components/MicrosoftClarity.tsx", "utf8");
  assert.match(clarity, /hasMarketingConsent\(\)/);
  const engagement = readFileSync("lib/analytics.ts", "utf8");
  assert.match(engagement, /return hasMarketingConsent\(\)/);
});
