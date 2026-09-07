import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  normalizeBankTransferCurrency,
  normalizeBankTransferDonorLocale,
  parseBankStatementFile,
} from "@/lib/bank-transfers/statement-parser";
import { enhanceBankTransferRowsSmart } from "@/lib/bank-transfers/smart-enhancer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 8 * 1024 * 1024;

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
    const bankId = typeof bankIdRaw === "string" && bankIdRaw.trim() ? bankIdRaw.trim() : "UNKNOWN_BANK";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File is too large. Maximum size is 8 MB" }, { status: 400 });
    }

    const fileName = file.name || "statement";
    const lower = fileName.toLowerCase();
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") || lower.endsWith(".pdf"))) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const parsed = await parseBankStatementFile({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName,
      currency,
      donorLocale,
      bankId,
    });
    const rows = enhanceBankTransferRowsSmart(parsed.rows);

    return NextResponse.json({
      fileName,
      bankId,
      currency,
      donorLocale,
      parser: parsed.parser,
      fileHash: parsed.fileHash,
      bankIban: parsed.bankIban,
      rowCount: rows.length,
      rows,
      smartAnalysis: true,
      // Lets the preview state plainly which column the money was read from,
      // so a wrong pick is caught before the import rather than after.
      amountColumn: parsed.amountColumn,
      warning: parsed.warning,
    });
  } catch (error) {
    console.error("[bank-transfers] preview parse failed", error);
    return NextResponse.json({ error: "Failed to parse bank statement" }, { status: 500 });
  }
}
