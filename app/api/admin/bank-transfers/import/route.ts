import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  readStatementForm,
  statementError,
} from "@/lib/bank-transfers/statement-request";
import {
  importReviewedStatement,
  reviewStatement,
  statementBank,
  StatementReviewError,
} from "@/lib/bank-transfers/statement-import";
import { verifyStatementPreview } from "@/lib/bank-transfers/statement-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const input = await readStatementForm(form);
    if (
      form.get("reviewConfirmed") !== "true" ||
      !verifyStatementPreview(
        String(form.get("previewToken") ?? ""),
        input.binding,
        process.env.NEXTAUTH_SECRET ?? "",
      )
    )
      throw new StatementReviewError("STATEMENT_PREVIEW_REQUIRED");
    if ((input.parsed.sheets?.length ?? 0) > 1 && !input.sheetChosen)
      throw new StatementReviewError("STATEMENT_SHEET_REQUIRED");
    const bank = await statementBank(prisma, input.bankId);
    const review = await reviewStatement(
      prisma,
      input.parsed,
      bank,
      input.excludedRows,
      input.excludedHashes,
    );
    const actor = auditActorFromDashboardSession(session!);
    const result = await importReviewedStatement(prisma, {
      ...input,
      fileName: input.file.name,
      review,
      actorId: actor.actorId,
      actorName: actor.actorName,
    });
    await writeAuditLog({
      ...actor,
      stream: "TEAM",
      action: "BANK_STATEMENT_IMPORTED",
      messageAr: "إدخال كشف حساب للمراجعة",
      entityType: "BankStatementUpload",
      entityId: result.uploadId,
      metadata: { ...result, parserVersion: input.parsed.parserVersion },
    });
    return NextResponse.json({ ...result, warning: input.parsed.warning });
  } catch (error) {
    return NextResponse.json(statementError(error), { status: 422 });
  }
}
