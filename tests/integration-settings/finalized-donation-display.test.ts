import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("resolved dashboard donation filter contains only confirmed paid and explicit failed rows", () => {
  const compiled = ts.transpileModule(
    readFileSync("lib/dashboard/donation-usd-revenue.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const output = { exports: {} as { donationStatusWhere: (status: string) => unknown } };
  new vm.Script(compiled).runInNewContext({
    module: output, exports: output.exports,
    require: (name: string) => {
      if (name === "@/lib/prisma") return { prisma: {} };
      throw new Error("Unexpected dependency: " + name);
    },
  });
  const where = output.exports.donationStatusWhere("RESOLVED");
  assert.equal(JSON.stringify(where), JSON.stringify({
    OR: [{ status: "PAID", paidAt: { not: null } }, { status: "FAILED" }],
  }));
  assert.equal(JSON.stringify(output.exports.donationStatusWhere("PAID")), JSON.stringify({
    status: "PAID", paidAt: { not: null },
  }));
  assert.equal(JSON.stringify(output.exports.donationStatusWhere("PENDING")), JSON.stringify({
    status: "PAID", OR: [{ paidAt: null }, { paidAt: { isSet: false } }],
  }));
});

test("main dashboard defaults to finalized-only donations but keeps unresolved in an explicit review filter", () => {
  const dashboard = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.match(dashboard, /donationsStatusFilter, setDonationsStatusFilter\] = useState<[^\n]+>\("RESOLVED"\)/);
  assert.match(dashboard, /SelectItem value="RESOLVED"/);
  assert.match(dashboard, /SelectItem value="PENDING"/);
});
