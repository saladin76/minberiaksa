import test from "node:test";
import assert from "node:assert/strict";
import { mapNetgsmCode, readNetgsmCode, scrubNetgsm, NETGSM_REASONS } from "../../lib/communication/providers/netgsm/errors";

/**
 * Netgsm answers a rejected send with a non-2xx status whose body still carries the numeric code.
 * The live account currently returns exactly this for every campaign send:
 *
 *   HTTP 406 {"code":"30","msgheaders":null,
 *             "description":"Check the usercode-password information and API access permission"}
 *
 * The adapter used to look only at `res.ok`, so that arrived on the delivery row as
 * NETGSM_REQUEST_FAILED — indistinguishable from a timeout, and pointing at the wrong cause.
 */

test("a rejected send is read from the body, not just the HTTP status", () => {
  const body = '{"code":"30","msgheaders":null,"description":"Check the usercode-password information and API access permission"}';
  const code = readNetgsmCode(body);
  assert.equal(code, "30");
  assert.equal(mapNetgsmCode(code!).ok, false);
  assert.equal(mapNetgsmCode(code!).reason, NETGSM_REASONS.UNAUTHORIZED);
});

test("plain-text code responses are read too", () => {
  assert.equal(readNetgsmCode("30"), "30");
  assert.equal(readNetgsmCode("00 1234567"), "00");
});

test("a body with no code leaves the transport reason intact", () => {
  assert.equal(readNetgsmCode(""), null);
  assert.equal(readNetgsmCode("<html><title>502 Bad Gateway</title></html>"), null);
  assert.equal(readNetgsmCode('{"error":"boom"}'), null);
});

test("actionable Netgsm codes map to distinct reasons", () => {
  assert.equal(mapNetgsmCode("00").ok, true);
  assert.equal(mapNetgsmCode("30").reason, NETGSM_REASONS.UNAUTHORIZED);
  assert.equal(mapNetgsmCode("40").reason, NETGSM_REASONS.HEADER_NOT_APPROVED);
  assert.equal(mapNetgsmCode("20").reason, NETGSM_REASONS.MESSAGE_INVALID);
  assert.equal(mapNetgsmCode("70").reason, NETGSM_REASONS.MESSAGE_INVALID);
  assert.equal(mapNetgsmCode("80").reason, NETGSM_REASONS.QUOTA_EXCEEDED);
  assert.equal(mapNetgsmCode("85").reason, NETGSM_REASONS.QUOTA_EXCEEDED);
  // Anything unrecognised must still fail closed rather than pass as a success.
  assert.equal(mapNetgsmCode("51").ok, false);
  assert.equal(mapNetgsmCode("51").reason, NETGSM_REASONS.REJECTED);
});

test("the detail persisted on a delivery row never carries credentials", () => {
  const scrubbed = scrubNetgsm('406: {"usercode":"W2xxxx3F","password":"53secret03","code":"30"}');
  assert.equal(scrubbed.includes("53secret03"), false);
  assert.equal(scrubbed.includes("W2xxxx3F"), false);
  assert.equal(scrubNetgsm("Authorization: Basic YWJjOmRlZg==").includes("YWJjOmRlZg=="), false);
});
