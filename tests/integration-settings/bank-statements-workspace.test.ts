import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import * as XLSX from "xlsx";
import { parseBankStatementFile } from "../../lib/bank-transfers/statement-parser";
import { statementDate } from "../../lib/bank-transfers/statement-metadata";
import {
  signStatementPreview,
  verifyStatementPreview,
} from "../../lib/bank-transfers/statement-preview";
import * as registry from "../../lib/bank-transfers/bank-registry";
import * as metadata from "../../lib/bank-transfers/statement-metadata";
import type * as Service from "../../lib/bank-transfers/statement-import";

// Raw Mongo commands in this in-memory fixture intentionally span multiple reply shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
type Database = Parameters<typeof service.statementRead>[0];
type Context = { params: Promise<{ id: string }> };
type JsonRequest = { json: () => Promise<Doc> };
function load<T>(file: string, deps: Doc): T {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const isolated = { exports: {} };
  new vm.Script(code).runInNewContext({
    module: isolated,
    exports: isolated.exports,
    Buffer,
    Date,
    Set,
    Map,
    console,
    process: { env: { NEXTAUTH_SECRET: "test-only" } },
    require: (name: string) => {
      if (!(name in deps)) throw new Error(`Unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return isolated.exports as T;
}
const service = load<typeof Service>("lib/bank-transfers/statement-import.ts", {
  "node:crypto": crypto,
  "../prisma-raw-command": { rawCommand: (v: unknown) => v },
  "./statement-metadata": metadata,
  "./bank-registry": registry,
});
// Invented values only. These fixtures contain no customer statement data.
const IBAN = "TR000000000000000000000042";
const bank = { id: "bank-a", name: "Synthetic account", ibanLast4: "0042" };
const BASE = {
  fileName: "synthetic.xlsx",
  bankId: bank.id,
  currency: "USD" as const,
  donorLocale: "tr" as const,
};
function workbook(
  rows: unknown[][],
  bookType: "xlsx" | "xls" = "xlsx",
  second?: unknown[][],
) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Hesap");
  if (second)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(second), "Other");
  return XLSX.write(wb, { type: "buffer", bookType }) as Buffer;
}
async function sample() {
  return parseBankStatementFile({
    ...BASE,
    buffer: workbook([
      ["IBAN", IBAN],
      [],
      [
        "Tarih",
        "Kanal",
        "Fiş No",
        "Açıklama",
        "Tutar (TL)",
        "Güncel Bakiye (TL)",
      ],
      [
        "02.10.2026 11:12:13",
        "FAST",
        "R-101",
        "Sender: Test Person",
        25.5,
        125.5,
      ],
      [
        "02.10.2026 11:13:14",
        "FAST",
        "R-102",
        "Sender: Test Person",
        25.5,
        151,
      ],
    ]),
  });
}
function database(initial: Doc[] = []) {
  const transactions = new Map(
    initial.map((row) => [row._id.$oid, structuredClone(row)]),
  );
  const uploads = new Map<string, Doc>();
  const commands: Doc[] = [];
  let failAt = 0;
  let attempts = 0;
  let unknownAt = 0;
  const matches = (row: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([key, value]) =>
      key === "$or"
        ? value.some((part: Doc) => matches(row, part))
        : value && typeof value === "object" && "$in" in value
          ? value.$in.includes(row[key])
          : key === "_id"
            ? row._id.$oid === value.$oid
            : row[key] === value,
    );
  const db = {
    $runCommandRaw: async (command: Doc): Promise<Doc> => {
      commands.push(command);
      if (command.find)
        return {
          ok: 1,
          cursor: {
            id: 0,
            firstBatch: [...transactions.values()].filter((row) =>
              matches(row, command.filter ?? {}),
            ),
          },
        };
      if (command.insert) {
        for (const row of command.documents) uploads.set(row._id.$oid, row);
        return { ok: 1, n: command.documents.length };
      }
      if (command.update === "BankStatementUpload") {
        const change = command.updates[0];
        Object.assign(uploads.get(change.q._id.$oid)!, change.u.$set);
        return { ok: 1, n: 1 };
      }
      if (command.update === "BankTransferTransaction") {
        let n = 0;
        const upserted: Doc[] = [],
          writeErrors: Doc[] = [];
        for (const [index, update] of command.updates.entries()) {
          attempts++;
          if (unknownAt === attempts) throw new Error("unknown write result");
          if (failAt === attempts) {
            writeErrors.push({ index, code: 121 });
            continue;
          }
          const key = update.q._id.$oid;
          if (!transactions.has(key)) {
            transactions.set(key, {
              _id: { $oid: key },
              ...update.u.$setOnInsert,
            });
            upserted.push({ index, _id: { $oid: key } });
          }
          n++;
        }
        return { ok: 1, n, upserted, writeErrors };
      }
      throw new Error("unexpected operation");
    },
  };
  const aggregateRaw = async ({ pipeline }: Doc) =>
    [...transactions.values()].filter((row) => matches(row, pipeline.find((stage: Doc) => stage.$match)?.$match ?? {}));
  Object.assign(db, {
    bankTransferTransactionRecord: { aggregateRaw },
    bankStatementUploadRecord: { aggregateRaw },
    bankTransferBankRecord: { aggregateRaw },
    bankAccount: { aggregateRaw },
  });
  return {
    db: db as unknown as Database,
    transactions,
    uploads,
    commands,
    fail: (n: number) => {
      failAt = n;
    },
    unknown: (n: number) => {
      unknownAt = n;
    },
  };
}

test("XLSX preamble and blank rows preserve IBAN, true row numbers, TRY, time and balances", async () => {
  const p = await sample();
  assert.equal(p.bankIban, IBAN);
  assert.equal(p.headerRowNumber, 3);
  assert.equal(p.detectedCurrency, "TRY");
  assert.equal(p.rows[0].rowNumber, 4);
  assert.equal(p.rows[0].transactionAt, "2026-10-02T11:12:13");
  assert.equal(p.rows[0].balance, 125.5);
  assert.equal(p.rows[0].channel, "FAST");
  assert.equal(p.rows[0].currency, "TRY");
  assert.equal(p.rows[0].amount, 25.5);
});
test("genuine BIFF XLS preserves its seven-column statement layout without treating references or balances as money", async () => {
  const p = await parseBankStatementFile({
    ...BASE,
    fileName: "synthetic.xls",
    buffer: workbook(
      [
        ["IBAN", IBAN],
        ...Array.from({ length: 6 }, () => []),
        [
          "Tarih",
          "Kanal",
          "Fiş No",
          "Açıklama",
          "Tutar(TL)",
          "Güncel Bakiye(TL)",
          "",
        ],
        ["03.10.2026 20:21", "FAST", "90001", "Test transfer", 80, 9080, ""],
      ],
      "xls",
    ),
  });
  assert.equal(p.headerRowNumber, 8);
  assert.equal(p.rows[0].rowNumber, 9);
  assert.equal(p.rows[0].amount, 80);
  assert.equal(p.rows[0].balance, 9080);
  assert.equal(p.rows[0].currency, "TRY");
});
test("Excel typed dates preserve wall-clock time, and calendar-invalid dates are rejected", async () => {
  assert.equal(statementDate("31.02.2026 12:00"), null);
  assert.equal(statementDate("01.10.2026 24:00"), null);
  const wb = XLSX.utils.book_new(),
    ws = XLSX.utils.aoa_to_sheet([
      ["Tarih", "Açıklama", "Tutar (TRY)"],
      [46300.5, "Test", 10],
    ]);
  ws.A2.z = "dd.mm.yyyy hh:mm";
  XLSX.utils.book_append_sheet(wb, ws, "Hesap");
  const p = await parseBankStatementFile({
    ...BASE,
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
  });
  assert.ok(p.rows[0].transactionAt?.endsWith("T12:00:00"));
});
test("missing amount never falls through to a running balance or channel/reference", async () => {
  const p = await parseBankStatementFile({
    ...BASE,
    buffer: workbook([
      ["Tarih", "Kanal", "Fiş No", "Açıklama", "Tutar (TRY)", "Bakiye"],
      ["03.10.2026", "123", "100001", "Test", "", 9000],
    ]),
  });
  assert.equal(p.rows[0].amount, null);
  assert.equal(p.rows[0].direction, "UNKNOWN");
});
test("all positive incoming exports remain credits despite balance gaps or reversed row order", async () => {
  const p = await parseBankStatementFile({
    ...BASE,
    buffer: workbook([
      ["Tarih", "Açıklama", "Tutar (TRY)", "Bakiye"],
      ["03.10.2026 12:00", "Test 1", 25, 200],
      ["01.10.2026 10:00", "Test 2", 30, 100],
    ]),
  });
  assert.deepEqual(
    p.rows.map((row) => row.direction),
    ["CREDIT", "CREDIT"],
  );
  assert.deepEqual(p.dateRange, { from: "2026-10-01", to: "2026-10-03" });
});
test("sheet selection and size limits are explicit; oversized data never truncates silently", async () => {
  const headers = ["Tarih", "Açıklama", "Tutar (TRY)"];
  const buffer = workbook([headers, ["01.10.2026", "First", 10]], "xlsx", [
    headers,
    ["02.10.2026", "Second", 20],
  ]);
  const p = await parseBankStatementFile({
    ...BASE,
    buffer,
    sheetName: "Other",
  });
  assert.equal(p.sheets?.length, 2);
  assert.equal(p.rows[0].amount, 20);
  await assert.rejects(
    parseBankStatementFile({ ...BASE, buffer, sheetName: "missing" }),
    /STATEMENT_SHEET/,
  );
  await assert.rejects(
    parseBankStatementFile({
      ...BASE,
      buffer: workbook([
        headers,
        ...Array.from({ length: 5001 }, (_, i) => [
          "01.10.2026",
          `Row ${i}`,
          1,
        ]),
      ]),
    }),
    /STATEMENT_TOO_LARGE/,
  );
});
test("canonical identity survives file format, row order and bank aliases; separate times/balances remain separate", async () => {
  const p = await sample(),
    alternate = await sample();
  assert.equal(p.rows[0].transactionHash, alternate.rows[0].transactionHash);
  const rows = [
    ["IBAN", IBAN],
    ["Tarih", "Açıklama", "Tutar (TL)", "Bakiye"],
    ["01.10.2026 10:01", "Same", 10, 100],
    ["01.10.2026 10:02", "Same", 10, 110],
  ];
  const a = await parseBankStatementFile({ ...BASE, buffer: workbook(rows) });
  const b = await parseBankStatementFile({
    ...BASE,
    bankId: "alias",
    fileName: "other.xls",
    buffer: workbook(rows, "xls"),
  });
  assert.notEqual(a.rows[0].transactionHash, a.rows[1].transactionHash);
  assert.equal(a.rows[0].transactionHash, b.rows[0].transactionHash);
});
test("preview receipts expire and bind file, bank, fallback currency, locale, sheet and parser version", () => {
  const binding = {
    fileHash: "a".repeat(64),
    bankId: "a",
    currency: "TRY",
    donorLocale: "tr",
    sheetName: "Hesap",
    parserVersion: 2,
  };
  const token = signStatementPreview(binding, "test-only", 1000);
  assert.equal(verifyStatementPreview(token, binding, "test-only", 2000), true);
  for (const [key, value] of Object.entries(binding))
    assert.equal(
      verifyStatementPreview(
        token,
        {
          ...binding,
          [key]: typeof value === "number" ? value + 1 : value + "x",
        },
        "test-only",
        2000,
      ),
      false,
    );
  assert.equal(
    verifyStatementPreview(token + "x", binding, "test-only", 2000),
    false,
  );
  assert.equal(
    verifyStatementPreview(token, binding, "test-only", 8_000_000),
    false,
  );
});
test("review catches same-file legacy rows, historical currency conflicts, and account mismatches", async () => {
  const p = await sample();
  const row = p.rows[0];
  const old = {
    _id: { $oid: "a".repeat(24) },
    ...row,
    transactionHashOld: row.transactionHash,
    uploadFileHash: p.fileHash,
  };
  old.transactionHash = row.legacyTransactionHash!;
  const d = database([old]);
  const review = await service.reviewStatement(d.db, p, bank);
  assert.equal(review.counts.EXISTING, 1);
  assert.equal(review.counts.NEW, 1);
  old.currency = "USD";
  const conflict = await service.reviewStatement(database([old]).db, p, {
    ...bank,
    ibanLast4: "9999",
  });
  assert.ok(conflict.blockers.includes("STATEMENT_PREVIOUS_CURRENCY_CONFLICT"));
  assert.ok(conflict.blockers.includes("STATEMENT_ACCOUNT_MISMATCH"));
});
test("uncertain legacy matches are held, and equal identities inside a sheet require exclusion and re-preview", async () => {
  const p = await sample();
  const d = database([
    {
      _id: { $oid: "b".repeat(24) },
      transactionHash: p.rows[0].legacyTransactionHash,
      currency: "TRY",
    },
  ]);
  assert.equal(
    (await service.reviewStatement(d.db, p, bank)).counts.POSSIBLE_DUPLICATE,
    1,
  );
  const two = { ...p, rows: [p.rows[0], { ...p.rows[0], rowNumber: 9 }] };
  assert.equal(
    (await service.reviewStatement(database().db, two, bank)).counts.AMBIGUOUS,
    2,
  );
  const resolved = await service.reviewStatement(
    database().db,
    two,
    bank,
    new Set([9]),
  );
  assert.equal(resolved.counts.NEW, 1);
  assert.equal(resolved.counts.EXCLUDED, 1);
});
test("atomic simultaneous imports save each candidate once and report actual counters without creating donations", async () => {
  const parsed = await sample(),
    d = database(),
    review = await service.reviewStatement(d.db, parsed, bank);
  const input = {
    parsed,
    review,
    bankId: bank.id,
    fileName: "synthetic.xlsx",
    donorLocale: "tr",
  };
  const results = await Promise.all([
    service.importReviewedStatement(d.db, input),
    service.importReviewedStatement(d.db, input),
  ]);
  assert.equal(d.transactions.size, 2);
  assert.equal(
    results.reduce((sum, r) => sum + r.importedCount, 0),
    2,
  );
  assert.equal(
    results.reduce((sum, r) => sum + r.duplicateCount, 0),
    2,
  );
  assert.ok(
    [...d.transactions.values()].every(
      (row) =>
        row.status === "PENDING_REVIEW" &&
        !row.donationId &&
        row.createdAt.$date,
    ),
  );
  const again = await service.reviewStatement(d.db, parsed, bank);
  assert.equal(again.counts.NEW, 0);
  assert.equal(again.counts.EXISTING, 2);
  assert.ok(
    d.commands.every((c) => !c.insert || c.insert === "BankStatementUpload"),
  );
});
test("partial and indeterminate writes are not reported as a completed import", async () => {
  const parsed = await sample();
  for (const uncertain of [false, true]) {
    const d = database();
    if (uncertain) d.unknown(2);
    else d.fail(2);
    const review = await service.reviewStatement(d.db, parsed, bank);
    const result = await service.importReviewedStatement(d.db, {
      parsed,
      review,
      bankId: bank.id,
      fileName: "test.xlsx",
      donorLocale: "tr",
    });
    assert.equal(result.importedCount, uncertain ? 0 : 1);
    assert.equal(result.unknownCount, uncertain ? 2 : 0);
    assert.equal(result.state, uncertain ? "UNRESOLVED" : "PARTIAL");
    assert.equal([...d.uploads.values()][0].status, result.state);
  }
});
test("statement reads use Prisma cursor-aware aggregateRaw, and reject malformed or oversized replies", async () => {
  const rows = Array.from({ length: 1200 }, (_, index) => ({
    _id: { $oid: index.toString(16).padStart(24, "0") },
  }));
  let reads = 0;
  const db = {
    bankTransferTransactionRecord: {
      aggregateRaw: async (args: Doc) => {
        reads++;
        assert.equal(args.pipeline.find((stage: Doc) => stage.$limit).$limit, 20001);
        return rows;
      },
    },
    $runCommandRaw: async () => {
      throw new Error("Session-bound raw cursors are forbidden");
    },
  } as unknown as Database;
  assert.equal(
    (await service.statementRead(db, "BankTransferTransaction", {})).length,
    1200,
  );
  assert.equal(reads, 1);
  let captured: Doc = {};
  await service.statementRead({ bankTransferTransactionRecord: { aggregateRaw: async (args: Doc) => { captured = args; return []; } } } as unknown as Database,
    "BankTransferTransaction", { bankId: "bank-a" }, { raw: 0 }, { sort: { createdAt: -1 }, skip: 50, limit: 50 });
  assert.equal(JSON.stringify(captured.pipeline), JSON.stringify([
    { $match: { bankId: "bank-a" } }, { $sort: { createdAt: -1 } }, { $skip: 50 }, { $limit: 50 }, { $project: { raw: 0 } },
  ]));
  assert.equal(captured.options.maxTimeMS, 15000);
  for (const limit of [0, -1, 20002, NaN, 1.5]) await assert.rejects(
    service.statementRead(db, "BankTransferTransaction", {}, undefined, { limit }), /STATEMENT_LOOKUP/);
  const failure = new Error("database read failed");
  await assert.rejects(service.statementRead({ bankTransferTransactionRecord: { aggregateRaw: async () => { throw failure; } } } as unknown as Database,
    "BankTransferTransaction", {}), error => error === failure);
  for (const result of [
    { cursor: { firstBatch: [] } },
    [{ invalid: true }, null],
    Array.from({ length: 20001 }, () => ({})),
  ])
    await assert.rejects(
      service.statementRead(
        {
          bankTransferTransactionRecord: { aggregateRaw: async () => result },
        } as unknown as Database,
        "BankTransferTransaction",
        {},
      ),
      /STATEMENT_LOOKUP/,
    );
});

function mutationFixture(initial: Doc | null, denied = false, outcome?: Doc) {
  const doc = initial ? structuredClone(initial) : null;
  let donationCalls = 0;
  const commands: Doc[] = [];
  const prisma = {
    $runCommandRaw: async (command: Doc) => {
      commands.push(command);
      const change = command.updates?.[0];
      if (!change || !doc) return { ok: 1, n: 0 };
      if (
        change.q.approvalClaim &&
        typeof change.q.approvalClaim === "string" &&
        change.q.approvalClaim !== doc.approvalClaim
      )
        return { ok: 1, n: 0 };
      if (change.q.approvalClaim?.$exists === false && doc.approvalClaim)
        return { ok: 1, n: 0 };
      if (change.q.donationId && doc.donationId) return { ok: 1, n: 0 };
      Object.assign(doc, change.u.$set);
      for (const key of Object.keys(change.u.$unset ?? {})) delete doc[key];
      return { ok: 1, n: 1 };
    },
  };
  const api = load<{
    PATCH: (request: JsonRequest, context: Context) => Promise<Response>;
    DELETE: (request: JsonRequest, context: Context) => Promise<Response>;
  }>("app/api/admin/bank-transfers/transactions/[id]/route.ts", {
    "node:crypto": crypto,
    "next/server": {
      NextResponse: {
        json: (body: unknown, init: { status?: number }) =>
          Response.json(body, init),
      },
    },
    "next-auth": { getServerSession: async () => ({ user: { id: "admin" } }) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma },
    "@/lib/dashboard/api-auth": {
      requireAdminOrDashboardPermission: () =>
        denied ? Response.json({}, { status: 403 }) : null,
    },
    "@/lib/audit-log": {
      auditActorFromDashboardSession: () => ({
        actorId: "admin",
        actorName: "Test",
      }),
      writeAuditLog: async () => {},
    },
    "@/lib/locales": {
      isValidLocale: (value: string) => ["ar", "en", "tr"].includes(value),
    },
    "@/lib/prisma-raw-command": { rawCommand: (value: unknown) => value },
    "@/lib/bank-transfers/statement-metadata": metadata,
    "@/lib/bank-transfers/statement-import": {
      statementRead: async () => (doc ? [structuredClone(doc)] : []),
    },
    "@/lib/donations/bank-transfer-donation": {
      createDonationFromBankTransfer: async () => {
        donationCalls++;
        if (outcome) return outcome;
        return {
          ok: true,
          donationId: "c".repeat(24),
          donorId: "d".repeat(24),
          campaignId: null,
        };
      },
    },
  });
  return {
    api,
    commands,
    getDoc: () => doc,
    donations: () => donationCalls,
    context: { params: Promise.resolve({ id: "a".repeat(24) }) },
    request: (body: Doc) => ({ json: async () => body }),
  };
}
const pending = {
  _id: { $oid: "a".repeat(24) },
  transactionHash: "f".repeat(64),
  status: "PENDING_REVIEW",
  amount: 25,
  currency: "TRY",
  direction: "CREDIT",
  transactionDate: "2026-10-01",
};
test("approval is permission protected, requires confirmation, refuses missing/debit/linked transactions, and never silently approves", async () => {
  for (const [doc, body, denied, expected] of [
    [pending, { status: "APPROVED", approvalConfirmed: true }, true, 403],
    [null, { status: "APPROVED", approvalConfirmed: true }, false, 404],
    [pending, { status: "APPROVED" }, false, 422],
    [
      { ...pending, direction: "DEBIT" },
      { status: "APPROVED", approvalConfirmed: true },
      false,
      422,
    ],
    [
      { ...pending, donationId: "c".repeat(24), status: "APPROVED" },
      { status: "IGNORED" },
      false,
      409,
    ],
    [
      { ...pending, donationId: "c".repeat(24), status: "APPROVED" },
      { status: "DELETED" },
      false,
      409,
    ],
  ] as Array<[Doc | null, Doc, boolean, number]>) {
    const f = mutationFixture(doc, denied);
    const reply = await f.api.PATCH(f.request(body), f.context);
    assert.equal(reply.status, expected);
    assert.equal(f.donations(), 0);
    assert.equal(f.commands.length, 0);
  }
});
test("unknown donation writes and historical conflicts retain the approval claim, while confirmed failures permit correction", async () => {
  for (const reason of [
    "DONATION_CREATE_UNRESOLVED",
    "DONATION_REVIEW_REQUIRED",
    "CAMPAIGN_NOT_FOUND",
  ]) {
    const fixture = mutationFixture(pending, false, { ok: false, reason });
    const reply = await fixture.api.PATCH(
      fixture.request({
        status: "APPROVED",
        approvalConfirmed: true,
        campaignId: "c".repeat(24),
      }),
      fixture.context,
    );
    const unresolved = reason !== "CAMPAIGN_NOT_FOUND";
    assert.equal(reply.status, unresolved ? 409 : 422);
    assert.equal(Boolean(fixture.getDoc()?.approvalClaim), unresolved);
    assert.equal(fixture.getDoc()?.campaignId, "c".repeat(24));
    assert.notEqual(fixture.getDoc()?.status, "APPROVED");
    if (unresolved) {
      assert.equal(fixture.getDoc()?.approvalState, "UNRESOLVED");
      assert.equal(
        (
          await fixture.api.PATCH(
            fixture.request({ status: "APPROVED", approvalConfirmed: true }),
            fixture.context,
          )
        ).status,
        409,
      );
      assert.equal(fixture.donations(), 1);
    }
  }
});

test("invalid legacy calendar dates cannot be approved", async () => {
  const fixture = mutationFixture({
    ...pending,
    transactionDate: "31.02.2026",
  });
  assert.equal(
    (
      await fixture.api.PATCH(
        fixture.request({ status: "APPROVED", approvalConfirmed: true }),
        fixture.context,
      )
    ).status,
    422,
  );
  assert.equal(fixture.donations(), 0);
});

test("two concurrent approval requests claim the transaction atomically and create only one donation", async () => {
  const f = mutationFixture(pending),
    request = f.request({ status: "APPROVED", approvalConfirmed: true });
  const results = await Promise.all([
    f.api.PATCH(request, f.context),
    f.api.PATCH(request, f.context),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(f.donations(), 1);
  assert.equal(f.getDoc()?.status, "APPROVED");
  assert.equal(f.getDoc()?.donationId, "c".repeat(24));
  assert.equal((await f.api.DELETE(f.request({}), f.context)).status, 409);
});
test("archiving a statement preserves every transaction and linked donation", async () => {
  const commands: Doc[] = [];
  const api = load<{ DELETE: (request: JsonRequest) => Promise<Response> }>(
    "app/api/admin/bank-transfers/uploads/route.ts",
    {
      "@/lib/bank-transfers/statement-import": {
        statementRead: async () => [
          { _id: { $oid: "e".repeat(24) }, fileHash: "f".repeat(64) },
        ],
      },
      "next/server": {
        NextResponse: {
          json: (body: unknown, init: { status?: number }) =>
            Response.json(body, init),
        },
      },
      "next-auth": { getServerSession: async () => ({}) },
      "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
      "@/lib/dashboard/api-auth": {
        requireAdminOrDashboardPermission: () => null,
      },
      "@/lib/prisma": {
        prisma: {
          $runCommandRaw: async (command: Doc) => {
            commands.push(command);
            return command.find
              ? {
                  cursor: {
                    firstBatch: [
                      {
                        _id: { $oid: "e".repeat(24) },
                        fileHash: "f".repeat(64),
                      },
                    ],
                  },
                }
              : { ok: 1, n: 1 };
          },
        },
      },
      "@/lib/audit-log": {
        auditActorFromDashboardSession: () => ({}),
        writeAuditLog: async () => {},
      },
    },
  );
  const response = await api.DELETE({
    json: async () => ({ ids: ["e".repeat(24)] }),
  });
  assert.equal(response.status, 200);
  assert.ok(
    commands.every((c) => !c.delete && c.update !== "BankTransferTransaction"),
  );
  assert.ok(
    commands.some(
      (c) =>
        c.update === "BankStatementUpload" && c.updates[0].u.$set.archivedAt,
    ),
  );
});
test("the import API rejects bypassing the preview before any persistence call", async () => {
  let writes = 0;
  const parsed = await sample(),
    binding = {
      fileHash: parsed.fileHash,
      bankId: bank.id,
      currency: "USD",
      donorLocale: "tr",
      sheetName: "Hesap",
      parserVersion: 2,
    };
  const api = load<{
    POST: (request: { formData: () => Promise<FormData> }) => Promise<Response>;
  }>("app/api/admin/bank-transfers/import/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init: { status?: number }) =>
          Response.json(body, init),
      },
    },
    "next-auth": { getServerSession: async () => ({}) },
    "@/app/api/auth/[...nextauth]/options": { authOptions: {} },
    "@/lib/prisma": { prisma: {} },
    "@/lib/dashboard/api-auth": {
      requireAdminOrDashboardPermission: () => null,
    },
    "@/lib/audit-log": {
      auditActorFromDashboardSession: () => ({}),
      writeAuditLog: async () => {},
    },
    "@/lib/bank-transfers/statement-preview": { verifyStatementPreview },
    "@/lib/bank-transfers/statement-request": {
      readStatementForm: async () => ({
        parsed,
        binding,
        bankId: bank.id,
        sheetChosen: true,
        file: { name: "synthetic.xlsx" },
      }),
      statementError: (e: Error & { code?: string }) => ({
        error: e.message,
        code: e.code,
      }),
    },
    "@/lib/bank-transfers/statement-import": {
      ...service,
      statementBank: async () => bank,
      reviewStatement: async () => ({ blockers: [] }),
      importReviewedStatement: async () => {
        writes++;
        return {};
      },
    },
  });
  for (const fields of [
    {},
    { reviewConfirmed: "true", previewToken: "fake" },
    {
      reviewConfirmed: "true",
      previewToken: signStatementPreview(
        { ...binding, bankId: "another" },
        "test-only",
      ),
    },
  ]) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value!);
    const response = await api.POST({ formData: async () => form });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "STATEMENT_PREVIEW_REQUIRED");
  }
  assert.equal(writes, 0);
});

