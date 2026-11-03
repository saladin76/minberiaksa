import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { rawCommand } from "../prisma-raw-command";
import { statementDate } from "./statement-metadata";
import {
  TRANSFER_BANK_COLLECTION,
  LEGACY_TRANSFER_BANK_FILTER,
} from "./bank-registry";
import type {
  ParsedBankStatement,
  ParsedBankTransferRow,
} from "./statement-parser";

type Database = Pick<
  PrismaClient,
  | "$runCommandRaw"
  | "bankTransferTransactionRecord"
  | "bankStatementUploadRecord"
  | "bankTransferBankRecord"
  | "bankAccount"
>;
type Doc = Record<string, unknown>;
export const STATEMENT_TRANSACTIONS = "BankTransferTransaction";
export const STATEMENT_UPLOADS = "BankStatementUpload";
const record = (v: unknown): Doc =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Doc) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const id = (v: unknown) => (typeof v === "string" ? v : str(record(v).$oid));
const compact = (v: unknown) =>
  str(v).replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
export class StatementReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Prisma findRaw drains its cursor in the originating session. A database
 * failure or an invalid/oversized result must never mean “no duplicates”. */
export async function statementRead(
  db: Database,
  collection: string,
  filter: Doc,
  projection?: Doc,
  options: Doc = {},
): Promise<Doc[]> {
  const model =
    collection === STATEMENT_TRANSACTIONS
      ? db.bankTransferTransactionRecord
      : collection === STATEMENT_UPLOADS
        ? db.bankStatementUploadRecord
        : collection === TRANSFER_BANK_COLLECTION
          ? db.bankTransferBankRecord
          : collection === "BankAccount"
            ? db.bankAccount
            : null;
  if (!model) throw new StatementReviewError("STATEMENT_LOOKUP_FAILED");
  const result = await model.findRaw({
    filter: rawCommand(filter),
    options: rawCommand({
      limit: 20001,
      batchSize: 500,
      maxTimeMS: 15000,
      ...options,
      ...(projection ? { projection } : {}),
    }),
  });
  if (
    !Array.isArray(result) ||
    result.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    throw new StatementReviewError("STATEMENT_LOOKUP_FAILED");
  if (result.length > 20000)
    throw new StatementReviewError("STATEMENT_LOOKUP_INCOMPLETE");
  return result as Doc[];
}
export type StatementBank = {
  id: string;
  name: string;
  ibanLast4: string | null;
};
export async function statementBank(
  db: Database,
  bankId: string,
): Promise<StatementBank> {
  const match = /^[a-f\d]{24}$/i.test(bankId)
    ? { _id: { $oid: bankId } }
    : { code: bankId };
  let rows = await statementRead(db, TRANSFER_BANK_COLLECTION, match);
  if (!rows.length)
    rows = await statementRead(db, "BankAccount", {
      ...LEGACY_TRANSFER_BANK_FILTER,
      ...match,
    });
  const row = rows[0];
  if (!row || row.isActive === false)
    throw new StatementReviewError("STATEMENT_BANK_REQUIRED");
  return {
    id: bankId,
    name: str(row.nameAr) || str(row.nameEn) || str(row.nameTr) || bankId,
    ibanLast4: str(row.ibanLast4).replace(/\D/g, "").slice(-4) || null,
  };
}
export type StatementRowState =
  | "NEW"
  | "EXISTING"
  | "POSSIBLE_DUPLICATE"
  | "AMBIGUOUS"
  | "INVALID"
  | "NOT_CREDIT"
  | "EXCLUDED";
export type StatementReviewRow = ParsedBankTransferRow & {
  rowKey: string;
  importState: StatementRowState;
  duplicateId: string | null;
};
export type StatementReview = {
  rows: StatementReviewRow[];
  counts: Record<StatementRowState, number>;
  incomingTotals: Record<string, number>;
  selectedTotals: Record<string, number>;
  blockers: string[];
  bank: StatementBank;
};
function oldTime(row: Doc) {
  return typeof row.transactionAt === "string"
    ? row.transactionAt
    : Array.isArray(row.raw)
      ? row.raw.map(statementDate).find((value) => value?.at)?.at
      : null;
}
function sameFileRow(row: ParsedBankTransferRow, old: Doc, fileHash: string) {
  if (
    old.uploadFileHash !== fileHash ||
    old.transactionDate !== row.transactionDate ||
    old.currency !== row.currency ||
    Number(old.amount) !== row.amount ||
    compact(old.description) !== compact(row.description)
  )
    return false;
  const at = oldTime(old);
  return (
    Boolean(row.reference && row.reference === old.reference) ||
    Boolean(at && row.transactionAt && at === row.transactionAt)
  );
}
export async function reviewStatement(
  db: Database,
  parsed: ParsedBankStatement,
  bank: StatementBank,
  excludedRows: Set<number> = new Set(),
  excludedHashes: Set<string> = new Set(),
): Promise<StatementReview> {
  const hashes = [
    ...new Set(
      parsed.rows.flatMap((row) => [
        row.transactionHash,
        row.legacyTransactionHash ?? row.transactionHash,
      ]),
    ),
  ];
  const existing: Doc[] = [];
  for (let offset = 0; offset < hashes.length; offset += 200)
    existing.push(
      ...(await statementRead(
        db,
        STATEMENT_TRANSACTIONS,
        { transactionHash: { $in: hashes.slice(offset, offset + 200) } },
        {
          transactionHash: 1,
          reference: 1,
          transactionDate: 1,
          transactionAt: 1,
          amount: 1,
          description: 1,
          parserVersion: 1,
          raw: 1,
          uploadFileHash: 1,
          currency: 1,
          status: 1,
        },
      )),
    );
  const sameFile = await statementRead(
    db,
    STATEMENT_TRANSACTIONS,
    { uploadFileHash: parsed.fileHash },
    {
      transactionHash: 1,
      reference: 1,
      transactionDate: 1,
      transactionAt: 1,
      raw: 1,
      uploadFileHash: 1,
      currency: 1,
      amount: 1,
      description: 1,
      status: 1,
    },
  );
  // Compatibility candidates catch overlapping legacy exports whose old hash
  // omitted a decoded IBAN/time or used another bank label. Weak matches are held.
  const nearby: Doc[] = [];
  for (let offset = 0; offset < parsed.rows.length; offset += 200) {
    const chunk = parsed.rows.slice(offset, offset + 200);
    const scope = parsed.bankIban
      ? { $or: [{ bankIban: parsed.bankIban }, { bankId: bank.id }] }
      : { bankId: bank.id };
    nearby.push(
      ...(await statementRead(
        db,
        STATEMENT_TRANSACTIONS,
        {
          ...scope,
          transactionDate: {
            $in: [
              ...new Set(
                chunk.map((row) => row.transactionDate).filter(Boolean),
              ),
            ],
          },
          amount: {
            $in: [
              ...new Set(
                chunk
                  .map((row) => row.amount)
                  .filter((value) => value !== null),
              ),
            ],
          },
        },
        {
          transactionHash: 1,
          reference: 1,
          transactionDate: 1,
          transactionAt: 1,
          raw: 1,
          uploadFileHash: 1,
          currency: 1,
          amount: 1,
          description: 1,
          status: 1,
        },
      )),
    );
    if (nearby.length > 20000)
      throw new StatementReviewError("STATEMENT_LOOKUP_INCOMPLETE");
  }
  const byHash = new Map(
    existing.map((row) => [str(row.transactionHash), row]),
  );
  const key = (row: {
    transactionDate?: unknown;
    currency?: unknown;
    amount?: unknown;
  }) => `${row.transactionDate}|${row.currency}|${row.amount}`;
  const candidates = new Map<string, Doc[]>();
  for (const row of [...sameFile, ...nearby]) {
    const k = key(row);
    candidates.set(k, [...(candidates.get(k) ?? []), row]);
  }
  const nearMatch = (row: ParsedBankTransferRow) =>
    candidates.get(key(row))?.find((old) => {
      if (old.reference && row.reference)
        return old.reference === row.reference;
      const at = oldTime(old);
      if (at && row.transactionAt && at !== row.transactionAt) return false;
      return compact(old.description) === compact(row.description);
    });
  const currencies = new Set(parsed.rows.map((row) => row.currency));
  const blockers: string[] = [];
  if (
    sameFile.some(
      (row) =>
        row.currency &&
        !currencies.has(str(row.currency) as ParsedBankTransferRow["currency"]),
    )
  )
    blockers.push("STATEMENT_PREVIOUS_CURRENCY_CONFLICT");
  if (
    bank.ibanLast4 &&
    parsed.bankIban &&
    !parsed.bankIban.endsWith(bank.ibanLast4)
  )
    blockers.push("STATEMENT_ACCOUNT_MISMATCH");
  const included = parsed.rows.filter(
    (row) =>
      !excludedRows.has(row.rowNumber) &&
      !excludedHashes.has(row.transactionHash),
  );
  const occurrences = new Map<string, number>();
  for (const row of included)
    occurrences.set(
      row.transactionHash,
      (occurrences.get(row.transactionHash) ?? 0) + 1,
    );
  const counts: StatementReview["counts"] = {
    NEW: 0,
    EXISTING: 0,
    POSSIBLE_DUPLICATE: 0,
    AMBIGUOUS: 0,
    INVALID: 0,
    NOT_CREDIT: 0,
    EXCLUDED: 0,
  };
  const incomingTotals: Record<string, number> = {},
    selectedTotals: Record<string, number> = {};
  const rows = parsed.rows.map((row) => {
    const previous =
      byHash.get(row.transactionHash) ??
      (row.legacyTransactionHash
        ? byHash.get(row.legacyTransactionHash)
        : undefined) ??
      nearMatch(row);
    let state: StatementRowState;
    if (
      excludedRows.has(row.rowNumber) ||
      excludedHashes.has(row.transactionHash)
    )
      state = "EXCLUDED";
    else if (
      !row.transactionDate ||
      !row.amount ||
      !Number.isFinite(row.amount) ||
      row.amount <= 0 ||
      row.issues?.length
    )
      state = "INVALID";
    else if (row.direction !== "CREDIT") state = "NOT_CREDIT";
    else if ((occurrences.get(row.transactionHash) ?? 0) > 1)
      state = "AMBIGUOUS";
    else if (previous) {
      const proven =
        (previous.transactionHash === row.transactionHash &&
          row.identityLevel !== "WEAK" &&
          previous.parserVersion === 2) ||
        sameFileRow(row, previous, parsed.fileHash) ||
        (row.reference && row.reference === previous.reference);
      state = proven ? "EXISTING" : "POSSIBLE_DUPLICATE";
    } else state = "NEW";
    counts[state]++;
    if (row.direction === "CREDIT" && row.amount && Number.isFinite(row.amount))
      incomingTotals[row.currency] =
        Math.round(((incomingTotals[row.currency] ?? 0) + row.amount) * 100) /
        100;
    if (state === "NEW" && row.amount)
      selectedTotals[row.currency] =
        Math.round(((selectedTotals[row.currency] ?? 0) + row.amount) * 100) /
        100;
    return {
      ...row,
      rowKey: `${parsed.sheetName ?? "file"}:${row.rowNumber}`,
      importState: state,
      duplicateId: previous ? id(previous._id) || null : null,
    };
  });
  return { rows, counts, incomingTotals, selectedTotals, blockers, bank };
}

/** Persist statement candidates only. Deterministic _id + atomic upsert makes
 * concurrent uploads idempotent without adding a unique index to old records. */
export async function importReviewedStatement(
  db: Database,
  input: {
    parsed: ParsedBankStatement;
    review: StatementReview;
    bankId: string;
    fileName: string;
    donorLocale: string;
    actorId?: string | null;
    actorName?: string | null;
  },
) {
  if (input.review.blockers.length)
    throw new StatementReviewError(input.review.blockers[0]);
  const rows = input.review.rows.filter((row) => row.importState === "NEW");
  const now = { $date: new Date().toISOString() },
    uploadId = randomBytes(12).toString("hex");
  let importedCount = 0,
    duplicateCount = input.review.counts.EXISTING,
    failedCount = 0;
  const upload = {
    _id: { $oid: uploadId },
    status: "PROCESSING",
    parserVersion: input.parsed.parserVersion ?? 1,
    bankId: input.bankId,
    fileName: input.fileName,
    fileHash: input.parsed.fileHash,
    bankIban: input.parsed.bankIban,
    currency: input.parsed.detectedCurrency ?? rows[0]?.currency ?? null,
    donorLocale: input.donorLocale,
    parser: input.parsed.parser,
    sheetName: input.parsed.sheetName ?? null,
    headerRowNumber: input.parsed.headerRowNumber ?? null,
    dateRange: input.parsed.dateRange ?? null,
    rowCount: input.parsed.rows.length,
    creditRowCount: input.parsed.rows.filter(
      (row) => row.direction === "CREDIT",
    ).length,
    excludedCount: input.review.counts.EXCLUDED,
    possibleDuplicateCount: input.review.counts.POSSIBLE_DUPLICATE,
    invalidCount: input.review.counts.INVALID + input.review.counts.AMBIGUOUS,
    importedCount: 0,
    duplicateCount,
    uploadedBy: input.actorId ?? null,
    uploadedByName: input.actorName ?? null,
    createdAt: now,
  };
  const inserted = record(
    await db.$runCommandRaw(
      rawCommand({ insert: STATEMENT_UPLOADS, documents: [upload] }),
    ),
  );
  if (
    inserted.ok !== 1 ||
    inserted.n !== 1 ||
    inserted.writeConcernError ||
    (Array.isArray(inserted.writeErrors) && inserted.writeErrors.length)
  )
    throw new StatementReviewError("STATEMENT_UPLOAD_FAILED");
  let state = "COMPLETED";
  try {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const chunk = rows.slice(offset, offset + 100);
      const updates = chunk.map((row) => {
        const document = {
          bankId: input.bankId,
          uploadId,
          uploadFileHash: input.parsed.fileHash,
          bankIban: input.parsed.bankIban,
          transactionHash: row.transactionHash,
          legacyTransactionHash: row.legacyTransactionHash ?? null,
          parserVersion: input.parsed.parserVersion ?? 1,
          transactionDate: row.transactionDate,
          transactionAt: row.transactionAt ?? null,
          statementTimeZone: "Europe/Istanbul",
          balance: row.balance ?? null,
          channel: row.channel ?? null,
          amount: row.amount,
          currency: row.currency,
          direction: row.direction,
          reference: row.reference,
          description: row.description,
          donorName: row.donorName,
          donorLocale: input.donorLocale,
          suggestedProject: row.suggestedProject,
          finalProject: row.suggestedProject,
          confidence: row.confidence,
          identityLevel: row.identityLevel ?? "WEAK",
          raw: row.raw,
          status: "PENDING_REVIEW",
          transferMethod: "BANK_TRANSFER",
          createdAt: now,
          importedBy: input.actorId ?? null,
          importedByName: input.actorName ?? null,
        };
        return {
          q: {
            _id: { $oid: row.transactionHash.slice(0, 24) },
            transactionHash: row.transactionHash,
          },
          u: { $setOnInsert: document },
          upsert: true,
        };
      });
      const response = record(
        await db.$runCommandRaw(
          rawCommand({
            update: STATEMENT_TRANSACTIONS,
            updates,
            ordered: false,
          }),
        ),
      );
      if (response.ok !== 1 || response.writeConcernError)
        throw new StatementReviewError("STATEMENT_WRITE_UNRESOLVED");
      const errors = Array.isArray(response.writeErrors)
        ? response.writeErrors.map(record)
        : [];
      const created = Array.isArray(response.upserted)
        ? response.upserted.length
        : 0;
      if (
        typeof response.n !== "number" ||
        response.n + errors.length !== chunk.length ||
        created > response.n ||
        errors.some(
          (error) => typeof error.index !== "number" || !chunk[error.index],
        )
      )
        throw new StatementReviewError("STATEMENT_WRITE_UNRESOLVED");
      importedCount += created;
      duplicateCount += response.n - created;
      for (const error of errors) {
        const row = chunk[Number(error.index)];
        if (error.code === 11000) {
          const found = await statementRead(
            db,
            STATEMENT_TRANSACTIONS,
            { _id: { $oid: row.transactionHash.slice(0, 24) } },
            { transactionHash: 1 },
          );
          if (found[0]?.transactionHash === row.transactionHash) {
            duplicateCount++;
            continue;
          }
        }
        failedCount++;
      }
    }
    if (failedCount) state = "PARTIAL";
  } catch {
    state = "UNRESOLVED";
  }
  const unknownCount =
    rows.length -
    importedCount -
    (duplicateCount - input.review.counts.EXISTING) -
    failedCount;
  const finalized = record(
    await db.$runCommandRaw(
      rawCommand({
        update: STATEMENT_UPLOADS,
        updates: [
          {
            q: { _id: { $oid: uploadId } },
            u: {
              $set: {
                status: state,
                importedCount,
                duplicateCount,
                failedCount,
                unknownCount,
                finishedAt: { $date: new Date().toISOString() },
              },
            },
          },
        ],
      }),
    ),
  );
  if (
    finalized.ok !== 1 ||
    finalized.n !== 1 ||
    finalized.writeConcernError ||
    (Array.isArray(finalized.writeErrors) && finalized.writeErrors.length)
  )
    throw new StatementReviewError("STATEMENT_WRITE_UNRESOLVED");
  return {
    uploadId,
    state,
    importedCount,
    duplicateCount,
    failedCount,
    unknownCount,
    excludedCount: input.review.counts.EXCLUDED,
    possibleDuplicateCount: input.review.counts.POSSIBLE_DUPLICATE,
    invalidCount: input.review.counts.INVALID + input.review.counts.AMBIGUOUS,
  };
}
