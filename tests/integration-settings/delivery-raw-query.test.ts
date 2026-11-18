import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Mod = { toMongoFilter: (w: unknown) => unknown; fromExtendedJson: (v: unknown) => unknown };
const js = ts.transpileModule(fs.readFileSync("lib/communication/delivery-raw-query.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod: { exports: Record<string, unknown> } = { exports: {} };
vm.runInNewContext(js, { module: mod, exports: mod.exports, Date, Number, String, Object, Array, Error, require: (n: string) => (n === "@/lib/prisma" ? { prisma: {} } : {}) });
const { toMongoFilter, fromExtendedJson } = mod.exports as unknown as Mod;
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

test("the dashboards' range filter becomes an index-friendly MongoDB filter (no $expr)", () => {
  const from = new Date("2026-10-19T00:00:00Z"), to = new Date("2026-11-18T00:00:00Z");
  const f = toMongoFilter({ channel: "EMAIL", createdAt: { gte: from, lte: to }, purpose: { not: "MARKETING" } });
  assert.deepEqual(plain(f), { $and: [{ channel: "EMAIL" }, { createdAt: { $gte: { $date: from.toISOString() }, $lte: { $date: to.toISOString() } } }, { purpose: { $ne: "MARKETING" } }] });
  assert.doesNotMatch(JSON.stringify(f), /\$expr/);
});

test("list filters: failed, opened/clicked OR, not-null, origin, case-insensitive search (escaped)", () => {
  assert.deepEqual(plain(toMongoFilter({ status: { in: ["FAILED", "BOUNCED"] } })), { status: { $in: ["FAILED", "BOUNCED"] } });
  assert.deepEqual(plain(toMongoFilter({ readAt: { not: null } })), { readAt: { $ne: null } });
  assert.deepEqual(plain(toMongoFilter({ AND: [{ OR: [{ openedAt: { not: null } }, { status: { in: ["OPENED", "CLICKED"] } }] }] })),
    { $and: [{ $or: [{ openedAt: { $ne: null } }, { status: { $in: ["OPENED", "CLICKED"] } }] }] });
  assert.deepEqual(plain(toMongoFilter({ OR: [{ recipientEmail: { contains: "a.b+1", mode: "insensitive" } }] })), { $or: [{ recipientEmail: { $regex: "a\\.b\\+1", $options: "i" } }] });
  assert.deepEqual(plain(toMongoFilter({ campaignId: "6af6ce0f6743493af15b7a39" })), { campaignId: { $oid: "6af6ce0f6743493af15b7a39" } });
  assert.deepEqual(plain(toMongoFilter({ retriedAt: { isSet: false } })), { retriedAt: { $exists: false } });
});

test("anything not translated is refused, never silently wrong", () => {
  assert.throws(() => toMongoFilter({ status: { startsWith: "F" } }), /UNSUPPORTED_FILTER startsWith/);
  assert.throws(() => toMongoFilter({ status: { not: { in: ["A"] } } }), /UNSUPPORTED_FILTER not/);
});

test("results come back in Prisma's shapes: string ids, Date objects", () => {
  const row = fromExtendedJson({ _id: { $oid: "6af6ce0f6743493af15b7a39" }, createdAt: { $date: "2026-11-18T10:00:00.000Z" }, n: { $numberLong: "5" } }) as Record<string, unknown>;
  assert.equal(row._id, "6af6ce0f6743493af15b7a39");
  assert.ok(row.createdAt instanceof Date && (row.createdAt as Date).toISOString() === "2026-11-18T10:00:00.000Z");
  assert.equal(row.n, 5);
});

test("both dashboards run their delivery queries through the index-friendly functions", () => {
  for (const f of ["app/api/dashboard/communication/email/route.ts", "app/api/dashboard/communication/whatsapp/route.ts"]) {
    const s = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(s, /prisma\.communicationDelivery\.(count|groupBy|findMany)\(/, f);
    assert.match(s, /from "@\/lib\/communication\/delivery-raw-query"/, f);
  }
});
