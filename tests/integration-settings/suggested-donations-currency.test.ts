import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSuggestedDonations,
  resolveDefaultDonationAmountForCurrency,
  resolveSuggestedAmountsForCurrency,
  validateSuggestedDonationsBody,
} from "../../lib/campaign/suggested-donations";

test("legacy donation settings keep USD amounts and have no forced default", () => {
  const config = parseSuggestedDonations({ amounts: [10, 25, 50], byCurrency: {} });
  assert.deepEqual(config.amounts, [10, 25, 50]);
  assert.equal(config.defaultAmountUSD, null);
  assert.deepEqual(resolveSuggestedAmountsForCurrency(config, "USD"), [10, 25, 50]);
});

test("USD presets convert for the selected currency and round to whole donation amounts", () => {
  const config = parseSuggestedDonations({ amounts: [10, 25, 50] });
  assert.deepEqual(resolveSuggestedAmountsForCurrency(config, "EUR", { EUR: 0.9 }), [9, 25, 45]);
  assert.deepEqual(resolveSuggestedAmountsForCurrency(config, "TRY"), []);
});

test("manual currency suggestions remain exact and the default picks the nearest configured local option", () => {
  const config = parseSuggestedDonations({
    amounts: [10, 25, 50],
    defaultAmountUSD: 25,
    byCurrency: { TRY: [700, 900] },
  });
  assert.deepEqual(resolveSuggestedAmountsForCurrency(config, "TRY", { TRY: 30 }), [700, 900]);
  assert.equal(resolveDefaultDonationAmountForCurrency(config, "USD"), 25);
  assert.equal(resolveDefaultDonationAmountForCurrency(config, "TRY", { TRY: 30 }), 700);
  assert.equal(resolveDefaultDonationAmountForCurrency(config, "TRY"), null);
});

test("default amount input is persisted only when it is a valid positive USD value", () => {
  assert.equal(validateSuggestedDonationsBody({ amounts: [10, 25], defaultAmountUSD: 50 })?.defaultAmountUSD, 50);
  assert.equal(validateSuggestedDonationsBody({ amounts: [10, 25], defaultAmountUSD: null })?.defaultAmountUSD, null);
  assert.throws(
    () => validateSuggestedDonationsBody({ amounts: [10, 25], defaultAmountUSD: -5 }),
    /positive number in USD/,
  );
  assert.throws(
    () => validateSuggestedDonationsBody({ amounts: [10, 25], defaultAmountUSD: 25.5 }),
    /positive number in USD/,
  );
  assert.equal(parseSuggestedDonations({ amounts: [10, 25], defaultAmountUSD: 25.5 }).defaultAmountUSD, null);
});
