import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { convertAmountInCurrencyToUsd } from "@/lib/exchange/convert-amount-in-currency-to-usd";
import { formatIstanbulDateKey } from "@/lib/admin/istanbul-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "BankTransferTransaction";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type GroupRow = { _id?: unknown; count?: number; total?: number };

export async function GET(request?: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "bankTransfers");
    if (denied) return denied;
    const month = request?.nextUrl.searchParams.get("period") === "month" ? formatIstanbulDateKey(new Date()).slice(0, 7) : null;
    const periodFilter = month ? { transactionDate: { $gte: `${month}-01`, $lte: formatIstanbulDateKey(new Date()) } } : {};

    const approvedResult = await prisma.$runCommandRaw({
      aggregate: COLLECTION,
      pipeline: [
        { $match: { direction: "CREDIT", status: { $in: ["APPROVED", "IMPORTED"] }, ...periodFilter } },
        { $group: { _id: "$currency", count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ],
      cursor: {},
    });

    const pendingResult = await prisma.$runCommandRaw({
      count: COLLECTION,
      query: { direction: "CREDIT", status: "PENDING_REVIEW", ...periodFilter },
    });

    const approvedRows = isRecord(approvedResult) && isRecord(approvedResult.cursor) && Array.isArray(approvedResult.cursor.firstBatch)
      ? approvedResult.cursor.firstBatch as GroupRow[]
      : [];

    const totals: Record<string, number> = {};
    const usdTotals: Record<string, number> = {};
    let approvedCount = 0;
    let totalUsd = 0;
    let unconvertedCurrencies = 0;

    for (const row of approvedRows) {
      const currency = typeof row._id === "string" ? row._id : "USD";
      const total = typeof row.total === "number" ? row.total : 0;
      const count = typeof row.count === "number" ? row.count : 0;
      totals[currency] = (totals[currency] ?? 0) + total;
      approvedCount += count;
      try {
        const usd = await convertAmountInCurrencyToUsd(total, currency);
        usdTotals[currency] = (usdTotals[currency] ?? 0) + usd;
        totalUsd += usd;
      } catch (error) {
        unconvertedCurrencies++;
        console.warn("[bank-transfers] currency conversion failed", { currency, error });
      }
    }

    const pendingCount = isRecord(pendingResult) && typeof pendingResult.n === "number" ? pendingResult.n : 0;

    return NextResponse.json({ totals, usdTotals, totalUsd, approvedCount, pendingCount, month, unconvertedCurrencies }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[bank-transfers] failed to load summary", error);
    return NextResponse.json({ error: "Failed to load bank transfers summary" }, { status: 500 });
  }
}
