import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  readStatementForm,
  statementError,
} from "@/lib/bank-transfers/statement-request";
import {
  reviewStatement,
  statementBank,
} from "@/lib/bank-transfers/statement-import";
import { signStatementPreview } from "@/lib/bank-transfers/statement-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
  if (denied) return denied;
  try {
    const input = await readStatementForm(await request.formData());
    const bank = await statementBank(prisma, input.bankId);
    const review = await reviewStatement(
      prisma,
      input.parsed,
      bank,
      input.excludedRows,
      input.excludedHashes,
    );
    if ((input.parsed.sheets?.length ?? 0) > 1 && !input.sheetChosen)
      review.blockers.push("STATEMENT_SHEET_REQUIRED");
    return NextResponse.json({
      ...input.parsed,
      ...review,
      fileName: input.file.name,
      bankId: input.bankId,
      currency: input.parsed.detectedCurrency ?? input.currency,
      donorLocale: input.donorLocale,
      rowCount: input.parsed.rows.length,
      previewToken: signStatementPreview(
        input.binding,
        process.env.NEXTAUTH_SECRET ?? "",
      ),
    });
  } catch (error) {
    return NextResponse.json(statementError(error), { status: 422 });
  }
}
