import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function nested(row: JsonMap, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as JsonMap)[key];
    return "";
  }, row);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const params = new URLSearchParams();
  params.set("platform", request.nextUrl.searchParams.get("platform") || "ALL");
  params.set("days", request.nextUrl.searchParams.get("days") || "7");

  const res = await fetch(`${request.nextUrl.origin}/api/admin/marketing-intelligence/budget-recommendations?${params.toString()}`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = await res.json().catch(() => null) as { recommendations?: JsonMap[] } | null;
  const rows = Array.isArray(data?.recommendations) ? data.recommendations : [];

  const columns = [
    ["priority", "priority"],
    ["decision", "decision"],
    ["title", "title"],
    ["reason", "reason"],
    ["action", "action"],
    ["spend", "metrics.spend"],
    ["siteRevenue", "metrics.siteRevenue"],
    ["siteRoas", "metrics.siteRoas"],
    ["platformRoas", "metrics.platformRoas"],
    ["siteDonations", "metrics.siteDonations"],
    ["platformConversions", "metrics.platformConversions"],
    ["donationGap", "metrics.donationGap"],
    ["source", "href"],
  ] as const;

  const lines = [columns.map(([label]) => cell(label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([, path]) => cell(nested(row, path))).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-recommendations-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
