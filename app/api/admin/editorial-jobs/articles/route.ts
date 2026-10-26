import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** A title-only, bounded lookup; article bodies never enter the picker response. */
export async function GET(request: NextRequest) {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "blog");
  if (denied) return denied;
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  const selected = request.nextUrl.searchParams.get("selected") || "";
  if (query.length > 120 || [...query].some(character => character.charCodeAt(0) < 32) || (selected && !/^[a-f0-9]{24}$/i.test(selected))) return NextResponse.json({error: "بحث غير صالح"}, {status: 400});
  try {
    const select = {id: true, title: true} as const;
    const [rows, current] = await Promise.all([
      prisma.post.findMany({where: query ? {title: {contains: query, mode: "insensitive"}} : {}, select, orderBy: [{title: "asc"}, {id: "asc"}], take: 51}),
      selected ? prisma.post.findUnique({where: {id: selected}, select}) : null,
    ]);
    const items = rows.slice(0, 50).map(row => ({id: row.id, title: row.title || ""}));
    if (current && !items.some(item => item.id === current.id)) items.unshift({id: current.id, title: current.title || ""});
    return NextResponse.json({items, hasMore: rows.length > 50}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return NextResponse.json({error: "تعذر تحميل المقالات"}, {status: 500});
  }
}
