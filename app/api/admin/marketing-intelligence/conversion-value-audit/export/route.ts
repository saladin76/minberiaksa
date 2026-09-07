import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const origin = request.nextUrl.origin;
  const params = new URLSearchParams();
  const days = request.nextUrl.searchParams.get("days") || "7";
  const limit = request.nextUrl.searchParams.get("limit") || "300";
  params.set("days", days);
  params.set("limit", limit);

  const res = await fetch(`${origin}/api/admin/marketing-intelligence/conversion-value-audit?${params.toString()}`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { rows?: JsonMap[] } | null;
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const header = [
    "donationId",
    "paidAt",
    "currency",
    "baseAmount",
    "teamSupport",
    "fees",
    "totalAmount",
    "expectedConversionValue",
    "missingFromBase",
    "verdict",
    "eventValues",
  ];

  const lines = [header.map(cell).join(",")];
  for (const row of rows) {
    lines.push([
      row.donationId,
      row.paidAt,
      row.currency,
      row.baseAmount,
      row.teamSupport,
      row.fees,
      row.totalAmount,
      row.expectedConversionValue,
      row.missingFromBase,
      row.verdict,
      JSON.stringify(row.eventValues ?? []),
    ].map(cell).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversion-value-audit-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
