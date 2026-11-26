import test from "node:test";
import assert from "node:assert/strict";
import { ramadanRealign } from "../../lib/donations/ramadan-billing";
import { ramadanChargeAt, parseRamadanRule } from "../../lib/donations/ramadan-schedule";
import { parseRamadanSettings } from "../../lib/minbar/ramadan-settings-validation";

const rule = { kind: "ramadan", hijriYear: 1448, slot: "maghrib", lat: 41.0082, lng: 28.9784, days: [{ day: 1, amount: 50 }, { day: 2, amount: 50 }, { day: 27, amount: 300 }], projectIds: ["a"] };

test("moving 1 Ramadan moves a plan that has not been charged yet", () => {
  const r = ramadanRealign(rule, "2027-02-08", "2027-02-09", null, [], new Date("2027-01-01T00:00:00Z"));
  assert.ok(!r.done && r.nextBillingDate.toISOString().slice(0, 10) === "2027-02-09" && r.amount === 50);
});

test("a day already charged is never charged again when 1 Ramadan moves later", () => {
  const paidDay1 = ramadanChargeAt(parseRamadanRule(rule)!, "2027-02-08", 1);
  const r = ramadanRealign(rule, "2027-02-08", "2027-02-09", paidDay1, [], new Date(paidDay1.getTime() + 3_600_000));
  assert.ok(!r.done);
  if (r.done) return;
  assert.equal(r.nextBillingDate.toISOString().slice(0, 10), "2027-02-10", "day 2 on the new calendar, not day 1 again");
});

test("settings stored before the homepage switches existed read as off", () => {
  const s = parseRamadanSettings({ enabled: true, hijriYear: 1448, startDate: "2027-02-08", startConfirmed: false, amounts: [20], byCurrency: {}, projectIds: ["6aa2eb31817054fc3dd6b294"], doubleLast10: true });
  assert.equal(s.homeBanner, false); assert.equal(s.homeSection, false);
});

test("homepage: banner and section render only behind both switches", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync("app/[locale]/page.tsx", "utf8");
  assert.match(page, /showRamadanBanner = Boolean\(ramadan\?\.enabled && ramadan\.homeBanner\)/);
  assert.match(page, /showRamadanSection = Boolean\(ramadan\?\.enabled && ramadan\.homeSection\)/);
  assert.match(fs.readFileSync("components/minbar/home/HomePage.tsx", "utf8"), /<QuickDonateBar config=\{quick\.config\} projects=\{quick\.projects\} \/>\n\s*\{ramadanSection\}/);
});
