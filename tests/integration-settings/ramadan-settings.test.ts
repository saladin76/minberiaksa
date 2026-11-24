import test from "node:test";
import assert from "node:assert/strict";
import { parseRamadanSettings, ramadanSettingsSchema } from "../../lib/minbar/ramadan-settings-validation";
import { DEFAULT_RAMADAN_SETTINGS } from "../../lib/minbar/ramadan-settings";

test("Ramadan settings: hidden by default, validated strictly", () => {
  const d = parseRamadanSettings(null);
  assert.equal(d.enabled, false); assert.deepEqual(d.amounts, [20, 50, 75, 100, 200, 300]); assert.equal(d.startDate, "2027-02-08");
  const ok = { ...DEFAULT_RAMADAN_SETTINGS, enabled: true, projectIds: ["6AA2EB31817054FC3DD6B294"] };
  assert.equal(ramadanSettingsSchema.parse(ok).projectIds[0], "6aa2eb31817054fc3dd6b294");
  assert.equal(ramadanSettingsSchema.safeParse({ ...DEFAULT_RAMADAN_SETTINGS, enabled: true }).success, false, "cannot enable without a project");
  assert.equal(ramadanSettingsSchema.safeParse({ ...DEFAULT_RAMADAN_SETTINGS, startDate: "2027-02-30" }).success, false, "a date that does not exist");
  assert.equal(ramadanSettingsSchema.safeParse({ ...DEFAULT_RAMADAN_SETTINGS, amounts: [50, 50] }).success, false, "duplicate amounts");
  assert.equal(ramadanSettingsSchema.safeParse({ ...DEFAULT_RAMADAN_SETTINGS, extra: 1 }).success, false, "strict");
});
