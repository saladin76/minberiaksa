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
  for (const key of ["platform", "level", "dateFrom", "dateTo"] as const) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  params.set("limit", request.nextUrl.searchParams.get("limit") || "1000");

  const res = await fetch(`${origin}/api/admin/marketing-intelligence/platform-metrics?${params.toString()}`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { rows?: JsonMap[] } | null;
  const rows = Array.isArray(data?.rows) ? data.rows : [];

  const header = ["date", "platform", "level", "accountId", "campaignId", "campaignName", "adsetId", "adsetName", "adId", "adName", "currency", "spend", "impressions", "clicks", "conversions", "revenue", "ctr", "cpc", "cpa", "roas"];
  const lines = [header.map(cell).join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => cell(row[key])).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="platform-metrics-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
