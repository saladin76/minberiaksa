import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardDonationDisplayDate,
  dashboardDonationDateSortField,
} from "../../lib/dashboard/donation-ledger-date";

const createdAt = "2026-11-10T20:30:00.000Z";
const paidAt = "2026-11-11T08:15:00.000Z";

test("settled donation date is paidAt, not its earlier createdAt", () => {
  assert.equal(dashboardDonationDisplayDate({ status:"PAID", paidAt, createdAt }).toISOString(), paidAt);
});

test("an optimistic PAID attempt with no paidAt keeps creation date", () => {
  assert.equal(dashboardDonationDisplayDate({ status:"PAID", paidAt:null, createdAt }).toISOString(), createdAt);
});

test("failed attempt displays creation date even if an inconsistent paidAt exists", () => {
  assert.equal(dashboardDonationDisplayDate({ status:"FAILED", paidAt, createdAt }).toISOString(), createdAt);
});

test("PAID settlement-only accounting list sorts by paidAt", () => {
  assert.equal(dashboardDonationDateSortField("accounting", "PAID", "date"), "paidAt");
});

test("mixed accounting and legacy lists retain creation-date order", () => {
  for (const status of ["RESOLVED","FAILED","PENDING","all",null]) {
    assert.equal(dashboardDonationDateSortField("accounting",status,"date"),"createdAt");
  }
  assert.equal(dashboardDonationDateSortField(null,"PAID","date"),"createdAt");
});

test("amount sorting is unaffected by settlement date basis", () => {
  assert.equal(dashboardDonationDateSortField("accounting","PAID","amount"),"amountUSD");
  assert.equal(dashboardDonationDateSortField(null,"all","amount"),"amountUSD");
});
