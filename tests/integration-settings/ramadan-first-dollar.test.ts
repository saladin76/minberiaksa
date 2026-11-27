import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { recurringBillingDecision } from "../../lib/donations/recurring-billing-safety";

const base = { id: "p", provider: "ALBARAKA", status: "ACTIVE", timezone: "Europe/Istanbul", amount: 1, lastBillingDate: new Date("2026-11-27T12:00:00Z"), chargeAttempts: 0 };

test("a Ramadan plan with a settled first payment is ready on its Ramadan day; weekly rules do not apply", () => {
  const rule = { kind: "ramadan", hijriYear: 1448, slot: "maghrib", lat: 41, lng: 29, days: [{ day: 1, amount: 1 }], projectIds: ["a"] };
  const d = recurringBillingDecision({ ...base, frequency: "RAMADAN", scheduleRule: rule, nextBillingDate: new Date("2027-02-08T14:00:00Z") }, { paidAt: new Date("2026-11-27T12:00:00Z"), initial: true }, new Date("2027-02-08T14:05:00Z"));
  assert.deepEqual(d, { state: "ready" });
});

test("ordinary plans keep their rules", () => {
  const d = recurringBillingDecision({ ...base, frequency: "WEEKLY", scheduleRule: null, nextBillingDate: new Date("2027-02-08T14:00:00Z") }, { paidAt: new Date("2026-11-27T12:00:00Z"), initial: true }, new Date("2027-02-08T14:05:00Z"));
  assert.equal(d.state, "hold");
});

test("the plan's first instalment is a 1 USD donation paid through the ordinary checkout", () => {
  const route = fs.readFileSync("app/api/ramadan/plans/route.ts", "utf8");
  assert.match(route, /const RAMADAN_VERIFICATION_USD = 1;/);
  assert.match(route, /tx\.donation\.create\(\{ data: \{[\s\S]*subscriptionId: sub\.id/);
  assert.doesNotMatch(route, /subscriptionCardVerification|buildAlbaraka3DForm/);
  assert.match(fs.readFileSync("components/minbar/ramadan/RamadanPage.tsx", "utf8"), /fetch\("\/api\/albaraka\/3d\/initiate"/);
  assert.match(fs.readFileSync("lib/donations/albaraka-settlement.ts", "utf8"), /plan\.frequency === "RAMADAN" \? \{\} : \{ nextBillingDate:/);
});

test("a direct (2D) first instalment is not reported as a failure, and a paid schedule is not created twice", () => {
  const page = fs.readFileSync("components/minbar/ramadan/RamadanPage.tsx", "utf8");
  assert.match(page, /pay\.ok && bank\.method === "GET"/);
  assert.match(page, /bank\.paid === true\) \{ setBusy\(false\); setDone\("success"\)/);
  assert.match(page, /RAMADAN_PLAN_EXISTS/);
  assert.doesNotMatch(page, /bank\.method === "GET" \|\| new URL/);
  const route = fs.readFileSync("app/api/ramadan/plans/route.ts", "utf8");
  assert.match(route, /error: "RAMADAN_PLAN_EXISTS"/);
  assert.match(route, /lastBillingDate: \{ gt: new Date\(0\) \}/);
});
