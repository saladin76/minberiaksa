import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  normalizeBankTransferCurrency,
  normalizeBankTransferDonorLocale,
  parseBankStatementFile,
} from "@/lib/bank-transfers/statement-parser";
import { enhanceBankTransferRowsSmart } from "@/lib/bank-transfers/smart-enhancer";
import { aiEnhanceBankRows, applyAiEnhancements } from "@/lib/bank-transfers/ai-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const TRANSACTIONS_COLLECTION = "BankTransferTransaction";
const UPLOADS_COLLECTION = "BankStatementUpload";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseExcludedHashes(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return new Set<string>();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
  } catch {
    return new Set<string>();
  }
}

async function existingHashes(hashes: string[]) {
  if (!hashes.length) return new Set<string>();
  const result = await prisma.$runCommandRaw({
    find: TRANSACTIONS_COLLECTION,
    filter: { transactionHash: { $in: hashes } },
    projection: { transactionHash: 1 },
  });
  const rows = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch as Record<string, unknown>[]
    : [];
  return new Set(rows.map((row) => typeof row.transactionHash === "string" ? row.transactionHash : "").filter(Boolean));
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file");
    const bankIdRaw = formData.get("bankId");
    const currency = normalizeBankTransferCurrency(formData.get("currency"));
    const donorLocale = normalizeBankTransferDonorLocale(formData.get("donorLocale") ?? formData.get("statementLocale"));
    const bankId = typeof bankIdRaw === "string" && bankIdRaw.trim() ? bankIdRaw.trim() : null;
    const excludedHashes = parseExcludedHashes(formData.get("excludedHashes"));

    if (!bankId) return NextResponse.json({ error: "Bank is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File is too large. Maximum size is 8 MB" }, { status: 400 });

    const fileName = file.name || "statement";
    const lower = fileName.toLowerCase();
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") || lower.endsWith(".pdf"))) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const parsed = await parseBankStatementFile({ buffer: Buffer.from(await file.arrayBuffer()), fileName, currency, donorLocale, bankId });
    // Heuristic first (always works), then AI refinement of donor name + purpose when configured.
    let enhancedRows = enhanceBankTransferRowsSmart(parsed.rows);
    let notesByHash = new Map<string, string>();
    let aiApplied = false;
    try {
      const ai = await aiEnhanceBankRows(enhancedRows);
      if (ai) {
        const applied = applyAiEnhancements(enhancedRows, ai);
        enhancedRows = applied.rows;
        notesByHash = applied.notesByHash;
        aiApplied = true;
      }
    } catch (err) {
      console.error("[bank-transfers] AI enhancement failed, using heuristics", err);
    }
    const allCreditRows = enhancedRows.filter((row) => row.direction === "CREDIT" && typeof row.amount === "number" && row.amount > 0);
    const creditRows = allCreditRows.filter((row) => !excludedHashes.has(row.transactionHash));
    const duplicateHashes = await existingHashes(creditRows.map((row) => row.transactionHash));
    const now = new Date();
    const actor = auditActorFromDashboardSession(session!);

    const uploadDoc = {
      bankId,
      fileName,
      fileHash: parsed.fileHash,
      bankIban: parsed.bankIban,
      currency,
      donorLocale,
      parser: parsed.parser,
      smartAnalysis: true,
      aiEnhanced: aiApplied,
      uploadedBy: actor.actorId,
      uploadedByName: actor.actorName,
      rowCount: enhancedRows.length,
      creditRowCount: allCreditRows.length,
      excludedCount: allCreditRows.length - creditRows.length,
      duplicateCount: creditRows.filter((row) => duplicateHashes.has(row.transactionHash)).length,
      importedCount: creditRows.filter((row) => !duplicateHashes.has(row.transactionHash)).length,
      createdAt: now,
    };

    await prisma.$runCommandRaw({ insert: UPLOADS_COLLECTION, documents: [uploadDoc] });

    const docs = creditRows
      .filter((row) => !duplicateHashes.has(row.transactionHash))
      .map((row) => ({
        bankId,
        uploadFileHash: parsed.fileHash,
        bankIban: parsed.bankIban,
        transactionHash: row.transactionHash,
        transactionDate: row.transactionDate,
        description: row.description,
        donorName: row.donorName,
        amount: row.amount,
        currency: row.currency,
        donorLocale: row.donorLocale,
        direction: row.direction,
        reference: row.reference,
        suggestedProject: row.suggestedProject,
        finalProject: row.suggestedProject,
        confidence: row.confidence,
        smartAnalysis: true,
        aiEnhanced: aiApplied,
        note: notesByHash.get(row.transactionHash) ?? null,
        status: "PENDING_REVIEW",
        transferMethod: "BANK_TRANSFER",
        raw: row.raw,
        createdAt: now,
        importedBy: actor.actorId,
        importedByName: actor.actorName,
      }));

    if (docs.length) await prisma.$runCommandRaw({ insert: TRANSACTIONS_COLLECTION, documents: docs });

    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: "BANK_STATEMENT_IMPORTED",
      messageAr: `${actor.actorName ?? "مسؤول"} رفع كشف حساب بنكي وأدخل ${docs.length} عملية للمراجعة`,
      entityType: "BankStatementUpload",
      metadata: { bankId, fileName, fileHash: parsed.fileHash, bankIban: parsed.bankIban, currency, donorLocale, smartAnalysis: true, importedCount: docs.length, duplicateCount: uploadDoc.duplicateCount, excludedCount: uploadDoc.excludedCount },
    });

    return NextResponse.json({ fileName, fileHash: parsed.fileHash, bankIban: parsed.bankIban, currency, donorLocale, parser: parsed.parser, smartAnalysis: true, rowCount: enhancedRows.length, creditRowCount: allCreditRows.length, excludedCount: uploadDoc.excludedCount, importedCount: docs.length, duplicateCount: uploadDoc.duplicateCount, importedRows: docs, warning: parsed.warning });
  } catch (error) {
    console.error("[bank-transfers] import failed", error);
    return NextResponse.json({ error: "Failed to import bank statement" }, { status: 500 });
  }
}
