import test from "node:test";
import assert from "node:assert/strict";
import { buildRamadanPlan } from "../../lib/donations/ramadan-plan";

const settings = { enabled: true, hijriYear: 1448, startDate: "2027-02-08", projectIds: ["6aa2eb31817054fc3dd6b294", "6aa2eb31817054fc3dd6b295"] };
const base = { days: [{ day: 1, amount: 50 }, { day: 27, amount: 300 }], slot: "maghrib" as const, timezone: "Europe/Istanbul", projectIds: ["6AA2EB31817054FC3DD6B294", "6aa2eb31817054fc3dd6b295"], intent: "parents" as const, remind: true };
const before = new Date("2026-12-01T00:00:00Z");

test("a valid plan: first charge, split over projects, total, normalised project ids", () => {
  const r = buildRamadanPlan(base, settings, before);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.first.day, 1); assert.equal(r.first.amount, 50); assert.equal(r.total, 350);
  assert.deepEqual(r.firstItems.map((i) => i.amount), [25, 25]);
  assert.deepEqual(r.rule.projectIds, ["6aa2eb31817054fc3dd6b294", "6aa2eb31817054fc3dd6b295"]);
  assert.equal(r.rule.kind, "ramadan"); assert.equal(r.rule.intent, "parents"); assert.equal(r.rule.onBehalf, null);
});

test("only offered projects, sane amounts, real days, and not after Ramadan", () => {
  assert.deepEqual(buildRamadanPlan({ ...base, projectIds: ["6aa2eb31817054fc3dd6b299"] }, settings, before), { ok: false, error: "PROJECT_NOT_OFFERED" });
  assert.deepEqual(buildRamadanPlan({ ...base, days: [{ day: 1, amount: 0.5 }] }, settings, before), { ok: false, error: "INVALID_AMOUNT" });
  assert.deepEqual(buildRamadanPlan({ ...base, days: [{ day: 31, amount: 50 }] }, settings, before), { ok: false, error: "INVALID_SCHEDULE" });
  assert.deepEqual(buildRamadanPlan({ ...base, days: [] }, settings, before), { ok: false, error: "INVALID_DAYS" });
  assert.deepEqual(buildRamadanPlan(base, settings, new Date("2027-04-01T00:00:00Z")), { ok: false, error: "RAMADAN_OVER" });
});

test("a plan made mid-Ramadan starts at the next chosen day; the name is kept only for 'on behalf of someone else'", () => {
  const r = buildRamadanPlan({ ...base, intent: "other", onBehalf: "  والدتي فاطمة  " }, settings, new Date("2027-02-20T00:00:00Z"));
  assert.ok(r.ok && r.first.day === 27 && r.rule.onBehalf === "والدتي فاطمة");
  const s = buildRamadanPlan({ ...base, onBehalf: "x" }, settings, before);
  assert.ok(s.ok && s.rule.onBehalf === null);
});
