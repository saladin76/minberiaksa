import test from "node:test";
import assert from "node:assert/strict";
import { gatewayOutage, gatewayRecovered, isSystemFailure, donationsStopped, type Attempt } from "../../lib/alerts/team-alert-rules";
const t = (min: number) => new Date(Date.UTC(2026, 10, 22, 0, min));
const a = (min: number, status: string, code: string | null, message: string | null = null, provider = "ALBARAKA"): Attempt => ({ provider, status, code, message, at: t(min) });
test("system failures are told apart from the donor's card", () => {
  assert.equal(isSystemFailure({ code: "E999", message: "Genel hata!" }), true);
  for (const c of ["51", "59", "83", "05", "5C"]) assert.equal(isSystemFailure({ code: c, message: "Fraud Şüphesi" }), false, c);
});
test("the 22 Nov outage: three E999 in a row opens the incident; a fraud decline in between does not count", () => {
  const rows = [a(1, "PAID", "00"), a(5, "FAILED", "59", "Fraud Şüphesi"), a(10, "FAILED", "E999", "Genel hata!"), a(20, "FAILED", "E999", "Genel hata!"), a(30, "FAILED", "E999", "Genel hata!")];
  const o = gatewayOutage(rows, "ALBARAKA"); assert.equal(o.down, true); assert.equal(o.count, 3); assert.deepEqual(o.since, t(10));
  assert.equal(gatewayOutage(rows.slice(0, 4), "ALBARAKA").down, false, "two are not enough");
  assert.equal(gatewayOutage(rows, "PAYFOR").down, false, "other gateways unaffected");
  assert.equal(gatewayRecovered([...rows, a(40, "PAID", "00")], "ALBARAKA", t(10)), true);
});
test("donations stopped only in the day, and only when they normally come", () => {
  const day = new Date("2026-11-22T10:00:00Z"); // 13:00 Istanbul
  assert.equal(donationsStopped(new Date("2026-11-22T07:30:00Z"), day, 5), true);
  assert.equal(donationsStopped(new Date("2026-11-22T09:00:00Z"), day, 5), false);
  assert.equal(donationsStopped(null, new Date("2026-11-22T01:00:00Z"), 5), false, "night");
  assert.equal(donationsStopped(null, day, 1), false, "a quiet time of day");
});
