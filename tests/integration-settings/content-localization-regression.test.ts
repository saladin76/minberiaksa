import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tr = JSON.parse(readFileSync("i18n/messages/tr.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("i18n/messages/en.json", "utf8")) as Record<string, Record<string, string>>;

test("Turkish Al-Aqsa landmarks, timeline, and current challenges are localized", () => {
  const keys = [
    ...Array.from({ length: 9 }, (_, index) => {
      const n = index + 1;
      return [`lm${n}_tag`, `lm${n}_title`, `lm${n}_slotHint`, `lm${n}_text`, `lm${n}_k1`, `lm${n}_v1`, `lm${n}_k2`, `lm${n}_v2`];
    }).flat(),
    ...Array.from({ length: 8 }, (_, index) => [`tl${index + 1}_title`, `tl${index + 1}_text`]).flat(),
    ...Array.from({ length: 6 }, (_, index) => [`th${index + 1}_title`, `th${index + 1}_text`]).flat(),
    "gatesLead", "minbarP2b", "minbarP2c", "minbarP3b", "fireWitnessPost", "custodyPost",
  ];

  for (const key of keys) {
    assert.ok(tr.aqsa[key]?.trim(), `Turkish aqsa.${key} must not be empty`);
    assert.notEqual(tr.aqsa[key], en.aqsa[key], `Turkish aqsa.${key} must not fall back to English`);
  }
});

test("Turkish achievement KPIs are localized", () => {
  for (let index = 1; index <= 6; index += 1) {
    const key = `programsKpi${index}`;
    assert.ok(tr.achievements[key]?.trim(), `Turkish achievements.${key} must not be empty`);
    assert.notEqual(tr.achievements[key], en.achievements[key], `Turkish achievements.${key} must not fall back to English`);
  }
});
