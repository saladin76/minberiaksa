import test from "node:test";
import assert from "node:assert/strict";
import {
  communicationPurposeWhere,
  parseCommunicationPurposeGroup,
  setCommunicationPurposeParams,
} from "../../lib/communication/purpose-group";

test("marketing view selects only marketing deliveries", () => {
  assert.deepEqual(communicationPurposeWhere("MARKETING"), { purpose: "MARKETING" });
});

test("automatic view includes all non-marketing purposes, including older or unknown values", () => {
  assert.deepEqual(communicationPurposeWhere("AUTOMATIC"), { purpose: { not: "MARKETING" } });
});

test("unselected purpose leaves existing API consumers unfiltered", () => {
  assert.deepEqual(communicationPurposeWhere(undefined), {});
});

test("purpose query parsing accepts only the two dashboard views", () => {
  assert.equal(parseCommunicationPurposeGroup("AUTOMATIC"), "AUTOMATIC");
  assert.equal(parseCommunicationPurposeGroup("MARKETING"), "MARKETING");
  assert.equal(parseCommunicationPurposeGroup("marketing"), undefined);
  assert.equal(parseCommunicationPurposeGroup(null), undefined);
});

test("switching to marketing preserves a campaign deep-link and other filters", () => {
  const params = setCommunicationPurposeParams("campaign=abc&page=4&search=receipt", "MARKETING");
  assert.equal(params.get("view"), "marketing");
  assert.equal(params.get("campaign"), "abc");
  assert.equal(params.has("page"), false);
  assert.equal(params.get("search"), "receipt");
});

test("switching to automatic clears marketing campaign scope to avoid an empty result", () => {
  const params = setCommunicationPurposeParams("campaign=abc&view=marketing&page=4&search=receipt", "AUTOMATIC");
  assert.equal(params.has("view"), false);
  assert.equal(params.has("campaign"), false);
  assert.equal(params.has("page"), false);
  assert.equal(params.get("search"), "receipt");
});
