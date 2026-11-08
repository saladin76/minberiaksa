import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Telegram pending reports include both explicit null and absent MongoDB paidAt", () => {
  const src = readFileSync("lib/telegram/commands.ts", "utf8");
  assert.match(src, /import \{ donationFieldEmpty \} from "@\/lib\/donations\/mongo-null"/);
  assert.match(src, /const PENDING_PAID = \{ status: "PAID", \.\.\.donationFieldEmpty\("paidAt"\) \}/);
  assert.match(src, /\{ status: "PAID", \.\.\.donationFieldEmpty\("paidAt"\) \},\s*"⏳ تبرعات قيد التأكيد"/);
  assert.doesNotMatch(src, /\{ status: "PAID", paidAt: null \}/);
});

test("Telegram revenue uses confirmation date, attempts use creation date", () => {
  const src = readFileSync("lib/telegram/commands.ts", "utf8");
  assert.match(src, /const settledDateFilter =[\s\S]*?paidAt: \{ gte: range.start, lt: range.end \}/);
  assert.match(src, /const attemptDateFilter =[\s\S]*?createdAt: \{ gte: range.start, lt: range.end \}/);
  assert.match(src, /donation\.count\(\{ where: \{ \.\.\.settledDateFilter, \.\.\.PAID \} \}\)/);
  assert.match(src, /donation\.count\(\{ where: \{ \.\.\.attemptDateFilter, \.\.\.PENDING_PAID \} \}\)/);
  assert.match(src, /where: \{ donation: \{ \.\.\.settledDateFilter, \.\.\.PAID \} \}/);
});
