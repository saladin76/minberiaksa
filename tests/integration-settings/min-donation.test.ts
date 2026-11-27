import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseMinDonation, minDonationFor, DEFAULT_MIN_DONATION } from "../../lib/minbar/donation-amount";

test("the floor: a USD base, fixed figures per currency, and a safe default", () => {
  assert.deepEqual(parseMinDonation(null), DEFAULT_MIN_DONATION);
  const cfg = parseMinDonation({ usd: 10, byCurrency: { TRY: 300, EUR: 10, usd: 5, XX: 1, SAR: -2 } });
  assert.deepEqual(cfg, { usd: 10, byCurrency: { TRY: 300, EUR: 10 } }, "bad codes and amounts are dropped");
  assert.equal(minDonationFor("TRY", 34, cfg), 300, "a fixed figure wins over the rate");
  assert.equal(minDonationFor("USD", null, cfg), 10);
  assert.equal(minDonationFor("SAR", 3.75, cfg), 38, "no fixed figure: the base at the rate, rounded up to a whole figure");
  assert.equal(minDonationFor("JPY", 150, cfg), 1500, "large units round up to whole figures");
});

test("checkout refuses below the configured floor and says what it is", () => {
  const route = fs.readFileSync("app/api/cart/payment/route.ts", "utf8");
  assert.match(route, /fixedMin \? line\.amount < fixedMin \* MIN_DONATION_USD_TOLERANCE : usdValue < minDonation\.usd \* MIN_DONATION_USD_TOLERANCE/);
  assert.match(route, /lineFrequencies\[lineIndex\] === "once" && !\(line as \{ shareCount\?: number \| null \}\)\.shareCount && \(fixedMin/, "recurring and share lines are exempt");
  assert.match(route, /code: "BELOW_MINIMUM", minimum:/);
  assert.match(fs.readFileSync("app/api/global-settings/route.ts", "utf8"), /minDonation: parseMinDonation\(settings\?\.minDonation\)/);
});
