import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const src = fs.readFileSync("lib/communication/inbox-conversations.ts", "utf8");
const start = src.indexOf("export const toExtendedJson"), end = src.indexOf("const raw = ");
const toExtendedJson = new Function(`${src.slice(start, end).replace("export const toExtendedJson = (value: unknown): unknown =>", "const toExtendedJson = (value) =>")}; return toExtendedJson;`)() as (v: unknown) => unknown;
test("dates reach MongoDB as real dates, at any depth; other values unchanged", () => {
  const at = new Date("2026-11-20T13:27:39Z");
  assert.deepEqual(toExtendedJson({ update: "X", updates: [{ q: { _id: "a" }, u: { $set: { lastInboundAt: at, n: 1, s: "t", z: null } } }] }),
    { update: "X", updates: [{ q: { _id: "a" }, u: { $set: { lastInboundAt: { $date: "2026-11-20T13:27:39.000Z" }, n: 1, s: "t", z: null } } }] });
});
test("every raw command goes through the conversion", () => {
  assert.match(src, /const raw = \(cmd: Record<string, unknown>\) => prisma\.\$runCommandRaw\(toExtendedJson\(cmd\) as Prisma\.InputJsonObject\);/);
});
