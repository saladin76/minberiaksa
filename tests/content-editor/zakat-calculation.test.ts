import test from "node:test";
import assert from "node:assert/strict";
import { calculateZakat } from "../../lib/minbar/zakat-calculation";

test("zakat amounts remain in the input currency without a second conversion", () => {
  const totals = calculateZakat({ cash: "10000" }, "100", "", "gold");
  assert.equal(totals.cash, 10000);
  assert.equal(totals.nisab, 8500);
  assert.equal(totals.net, 10000);
  assert.equal(totals.due, 250);
});

test("zakat weights gold by purity and includes silver at its own rate", () => {
  const totals = calculateZakat({ gold24: "10", gold21: "8", gold18: "4", silver: "100" }, "100", "2", "silver");
  assert.equal(totals.metals, 2200);
  assert.equal(totals.nisab, 1190);
  assert.equal(totals.due, 55);
});

test("zakat deducts debts without allowing negative wealth or negative inputs", () => {
  const totals = calculateZakat({ cash: "10000", bank: "-2000", debts: "12000" }, "100", "", "gold");
  assert.equal(totals.cash, 10000);
  assert.equal(totals.net, 0);
  assert.equal(totals.due, 0);
});

test("zakat requires a known nisab and handles empty inputs", () => {
  assert.equal(calculateZakat({ cash: "10000" }, "", "", "gold").due, 0);
  assert.equal(calculateZakat({}, "100", "", "gold").due, 0);
  assert.equal(calculateZakat({ cash: "8499" }, "100", "", "gold").due, 0);
  assert.equal(calculateZakat({ cash: "8500" }, "100", "", "gold").due, 212.5);
});

test("zakat accepts Arabic digits and ignores malformed numeric values", () => {
  const totals = calculateZakat({ cash: "١٠٠٠٠", bank: "invalid" }, "١٠٠", "", "gold");
  assert.equal(totals.cash, 10000);
  assert.equal(totals.due, 250);
});
