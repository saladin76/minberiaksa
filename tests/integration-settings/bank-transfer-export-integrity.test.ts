import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";

type RecordValue = Record<string, unknown>;
type Arguments = { pipeline: RecordValue[]; options: RecordValue };
function fixture(length: number, failure = false, denied = false) {
  const reads: Arguments[] = [];
  const errors: string[] = [];
  const rows = Array.from({ length }, (_, i) => ({
    _id: { $oid: i.toString(16).padStart(24, "0") },
    donorName: `Synthetic donor ${i + 1}`,
    bankId: "synthetic",
    amount: i + 1,
    currency: "TRY",
    transactionDate: "2026-10-01",
    transactionAt: "2026-10-01T12:30:00",
    balance: 1000,
    channel: "FAST",
    direction: "CREDIT",
    status: "PENDING_REVIEW",
  }));
  const prisma = {
    bankTransferTransactionRecord: {
      aggregateRaw: async (args: Arguments) => {
        reads.push(args);
        if (failure) throw Error("fixture read failed");
        return rows;
      },
    },
  };
  const serviceModule = {
    exports: {} as {
      statementRead: (...args: unknown[]) => Promise<RecordValue[]>;
    },
  };
  const importSource = ts.transpileModule(
    fs.readFileSync("lib/bank-transfers/statement-import.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new vm.Script(importSource).runInNewContext({
    module: serviceModule,
    exports: serviceModule.exports,
    require: (name: string) =>
      ({
        "../prisma-raw-command": { rawCommand: (v: unknown) => v },
        "node:crypto": {},
        "./statement-metadata": {},
        "./bank-registry": {},
      })[name],
  });
  const dependencies: RecordValue = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({}) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@/lib/dashboard/api-auth": {
      requireAdminOrDashboardPermission: () =>
        denied ? Response.json({}, { status: 403 }) : null,
    },
    "@/lib/bank-transfers/statement-import": serviceModule.exports,
    "@/lib/dashboard/i18n": {
      DASH_LOCALE_COOKIE: "dash-locale",
      dt: (value: string) => value,
      parseDashLocale: (value: string) => value,
      setDashLocale: () => {},
    },
    xlsx: XLSX,
  };
  const isolated = {
    exports: {} as {
      GET: (request: {
        url: string;
        cookies: { get: () => { value: string } };
      }) => Promise<Response>;
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync("app/api/admin/bank-transfers/export/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new vm.Script(code).runInNewContext({
    module: isolated,
    exports: isolated.exports,
    Buffer,
    URL,
    console: {
      error: (...args: unknown[]) => errors.push(args.map(String).join(" ")),
    },
    require: (name: string) => {
      if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return {
    reads,
    errors,
    get: () =>
      isolated.exports.GET({
        url: "https://fixture.invalid/api/admin/bank-transfers/export?bankId=synthetic&currency=TRY&q=Test%5B1%5D&sortBy=amount&sortDir=asc",
        cookies: { get: () => ({ value: "ar" }) },
      }),
  };
}
test("Excel export includes every returned record beyond Mongo first-batch size and preserves financial/time columns", async () => {
  const f = fixture(1200),
    response = await f.get();
  assert.equal(response.status, 200, f.errors.join("\n"));
  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), {
    type: "buffer",
  });
  const rows = XLSX.utils.sheet_to_json<RecordValue>(
    workbook.Sheets[workbook.SheetNames[0]],
  );
  assert.equal(rows.length, 1200);
  assert.equal(rows[1199]["اسم المتبرع"], "Synthetic donor 1200");
  assert.equal(rows[1199]["القيمة"], 1200);
  assert.equal(rows[0]["التاريخ والوقت"], "2026-10-01T12:30:00");
  assert.equal(rows[0]["الرصيد"], 1000);
  assert.equal(rows[0]["القناة"], "FAST");
  const pipeline = f.reads[0].pipeline;
  const filter = pipeline.find(stage => stage.$match)?.$match as RecordValue;
  assert.equal(filter.bankId, "synthetic");
  assert.equal(filter.currency, "TRY");
  assert.equal((pipeline.find(stage => stage.$sort)?.$sort as RecordValue).amount, 1);
  assert.equal(pipeline.find(stage => stage.$limit)?.$limit, 10001);
  assert.equal((pipeline.find(stage => stage.$project)?.$project as RecordValue).raw, 0);
  assert.equal(f.reads[0].options.maxTimeMS, 15000);
  assert.equal(
    ((filter.$or as RecordValue[])[0].donorName as RecordValue)
      .$regex,
    "Test\\[1\\]",
  );
});
test("over-limit exports return an explicit error instead of a silently truncated workbook", async () => {
  const f = fixture(10001),
    response = await f.get();
  assert.equal(response.status, 422, f.errors.join("\n"));
  assert.equal((await response.json()).code, "EXPORT_LIMIT_EXCEEDED");
  assert.equal(
    response.headers.get("content-type")?.includes("spreadsheet"),
    false,
  );
});
test("export read failures cannot return an empty successful workbook; permission denial makes no reads", async () => {
  const failed = fixture(0, true);
  assert.equal((await failed.get()).status, 500);
  assert.equal(failed.reads.length, 1);
  assert.match(failed.errors.join("\n"), /fixture read failed/);
  const denied = fixture(1, false, true);
  assert.equal((await denied.get()).status, 403);
  assert.equal(denied.reads.length, 0);
});

