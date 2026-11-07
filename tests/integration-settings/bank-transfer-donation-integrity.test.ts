import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";
import type {
  BankTransferDonationInput,
  BankTransferDonationResult,
} from "../../lib/donations/bank-transfer-donation";

type Row = {
  id: string;
  donorId: string;
  provider: string;
  providerOrderId: string;
  amount: number;
  currency: string;
  status: string;
  items: { campaignId: string }[];
};
type CreateArgs = { data: Record<string, unknown> };
type Callback = (tx: {
  user: { create: () => Promise<{ id: string }> };
  donation: { create: (args: CreateArgs) => Promise<{ id: string }> };
}) => Promise<{ id: string; donorId: string }>;
type Options = {
  existing?: Row[];
  failRead?: boolean;
  failContact?: boolean;
  failCommit?: boolean;
  commitThenLoseReply?: boolean;
  failReadback?: boolean;
  rejectCode?: string;
};
const input: BankTransferDonationInput = {
  transactionHash: "e".repeat(64),
  donorName: "Synthetic Person",
  amount: 25,
  currency: "USD",
  transactionDate: "2026-10-01",
  donorContact: "synthetic@example.test",
};
function fixture(options: Options = {}) {
  const donations = new Map<string, Row>(
    (options.existing ?? []).map((row) => [row.id, row]),
  );
  const attemptedIds: string[] = [];
  let writes = 0,
    donorCreates = 0,
    sequence = Promise.resolve();
  const prisma = {
    donation: {
      findMany: async () => {
        if (options.failRead) throw Error("private database details");
        return [...donations.values()];
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (options.failReadback) throw Error("readback unavailable");
        return donations.get(where.id) ?? null;
      },
    },
    campaign: {
      findUnique: async () => ({ id: "c".repeat(24), isDeleted: false }),
    },
    user: {
      findMany: async () => {
        if (options.failContact) throw Error("private lookup failure");
        return [{ id: "d".repeat(24) }];
      },
      findUnique: async () => ({ id: "d".repeat(24) }),
    },
    $transaction: (callback: Callback) => {
      const result = sequence.then(async () => {
        const staged: Row[] = [];
        let stagedDonors = 0;
        const value = await callback({
          user: {
            create: async () => {
              stagedDonors++;
              return { id: "d".repeat(24) };
            },
          },
          donation: {
            create: async ({ data }) => {
              writes++;
              const id = String(data.id);
              attemptedIds.push(id);
              if (donations.has(id))
                throw Object.assign(Error("duplicate"), { code: "P2002" });
              if (options.rejectCode)
                throw Object.assign(Error("rejected"), {
                  code: options.rejectCode,
                });
              if (options.failCommit) throw Error("unknown commit");
              staged.push({
                id,
                donorId: String(data.donorId),
                provider: String(data.provider),
                providerOrderId: String(data.providerOrderId),
                amount: Number(data.amount),
                currency: String(data.currency),
                status: String(data.status),
                items: [],
              });
              return { id };
            },
          },
        });
        for (const row of staged) donations.set(row.id, row);
        donorCreates += stagedDonors;
        if (options.commitThenLoseReply) throw Error("lost acknowledgement");
        return value;
      });
      sequence = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "node:crypto": crypto,
    "@/lib/prisma": { prisma },
    "@/lib/exchange/rates-service": {
      getUsdBaseRatesForServer: async () => ({ USD: 1, TRY: 40 }),
    },
    "@/lib/campaign/current-amount": {
      recomputeCampaignCurrentAmount: async () => {},
    },
  };
  const code = ts.transpileModule(
    fs.readFileSync("lib/donations/bank-transfer-donation.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const isolated = {
    exports: {} as {
      createDonationFromBankTransfer: (
        value: BankTransferDonationInput,
      ) => Promise<BankTransferDonationResult>;
    },
  };
  new vm.Script(code).runInNewContext({
    module: isolated,
    exports: isolated.exports,
    Date,
    Set,
    Map,
    process: { env: { DATABASE_URL: "mongodb://fixture.invalid/test" } },
    require: (name: string) => {
      if (!(name in dependencies)) throw Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return {
    create: isolated.exports.createDonationFromBankTransfer,
    donations,
    attemptedIds,
    writes: () => writes,
    donorCreates: () => donorCreates,
  };
}
function existingRow(patch: Partial<Row> = {}): Row {
  return {
    id: "a".repeat(24),
    donorId: "d".repeat(24),
    provider: "BANK_TRANSFER",
    providerOrderId: "BANK:" + input.transactionHash,
    amount: 25,
    currency: "USD",
    status: "PAID",
    items: [],
    ...patch,
  };
}

test("an unavailable duplicate/contact lookup performs zero donation writes", async () => {
  for (const option of [{ failRead: true }, { failContact: true }]) {
    const f = fixture(option);
    const result = await f.create(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DATABASE_UNAVAILABLE");
    assert.equal(f.writes(), 0);
  }
});
test("existing historical donations are linked without another write; ambiguous or conflicting evidence needs review", async () => {
  const f = fixture({
    existing: [existingRow({ items: [{ campaignId: "c".repeat(24) }] })],
  });
  const result = await f.create(input);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.donationId, "a".repeat(24));
    assert.equal(result.campaignId, "c".repeat(24));
    assert.equal(result.duplicate, true);
  }
  assert.equal(f.writes(), 0);
  for (const rows of [
    [existingRow(), existingRow({ id: "b".repeat(24) })],
    [existingRow({ amount: 999 })],
    [existingRow({ currency: "EUR" })],
    [existingRow({ status: "REFUNDED" })],
  ]) {
    const testCase = fixture({ existing: rows });
    const reply = await testCase.create(input);
    assert.equal(reply.ok, false);
    if (!reply.ok) assert.equal(reply.reason, "DONATION_REVIEW_REQUIRED");
    assert.equal(testCase.writes(), 0);
  }
});
test("concurrent conversions of legacy duplicate statement rows use one database identity and one donation", async () => {
  const f = fixture();
  const results = await Promise.all([f.create(input), f.create(input)]);
  assert.ok(results.every((result) => result.ok));
  assert.equal(f.donations.size, 1);
  assert.equal(new Set(f.attemptedIds).size, 1);
  assert.ok(results.some((result) => result.ok && result.duplicate));
});
test("a lost commit reply is recovered by reading the exact persisted donation, without another create", async () => {
  const f = fixture({ commitThenLoseReply: true });
  const result = await f.create(input);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.duplicate, true);
  assert.equal(f.writes(), 1);
  assert.equal(f.donations.size, 1);
});
test("uncertain commit or unreadable acknowledgement is not labelled a confirmed rejection", async () => {
  for (const options of [
    { failCommit: true },
    { commitThenLoseReply: true, failReadback: true },
  ]) {
    const f = fixture(options);
    const result = await f.create(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DONATION_CREATE_UNRESOLVED");
  }
});
test("a confirmed transaction rejection rolls back donor creation and remains correctable", async () => {
  const f = fixture({ rejectCode: "P2000" });
  const result = await f.create({ ...input, donorContact: null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "DONATION_CREATE_FAILED");
  assert.equal(f.donorCreates(), 0);
  assert.equal(f.donations.size, 0);
});
test("non-finite donation amounts are rejected before any write", async () => {
  for (const amount of [NaN, Infinity, -1, 0]) {
    const f = fixture();
    const reply = await f.create({ ...input, amount });
    assert.equal(reply.ok, false);
    if (!reply.ok) assert.equal(reply.reason, "INVALID_AMOUNT");
    assert.equal(f.writes(), 0);
  }
});
