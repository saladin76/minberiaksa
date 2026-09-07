import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

type JsonMap = Record<string, unknown>;

function cell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/api/admin/marketing-intelligence/action-items`, {
    headers: { cookie: request.headers.get("cookie") || "" },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { items?: JsonMap[] } | null;
  const items = Array.isArray(data?.items) ? data.items : [];

  const header = ["priority", "type", "title", "description", "action", "href"];
  const lines = [header.map(cell).join(",")];
  for (const item of items) {
    lines.push([
      item.priority,
      item.type,
      item.title,
      item.description,
      item.action,
      item.href,
    ].map(cell).join(","));
  }

  return new NextResponse(`\uFEFF${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="marketing-action-items-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
