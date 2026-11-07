import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { CONFIG } from "@/lib/content-editor/contracts";
import { contentReadiness, isReadinessKind } from "@/lib/content-editor/readiness";
import { contentStore } from "@/lib/content-editor/store";
import { campaignWorkspaceWhere } from "@/lib/content-editor/site-capabilities";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  const cursor = request.nextUrl.searchParams.get("cursor"), query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!isReadinessKind(kind) || cursor && !/^[a-f0-9]{24}$/i.test(cursor) || query.length > 120 || /[\u0000-\u001f]/.test(query))
    return NextResponse.json({ error: "اختيار أو بحث غير صالح" }, { status: 400 });
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), CONFIG[kind].permission);
  if (denied) return denied;
  try {
    const rows = await contentStore.model(CONFIG[kind].model).findMany({
      where: { AND: [kind === "campaigns" ? campaignWorkspaceWhere() : {}, ...(query ? [{ [kind === "categories" ? "name" : "title"]: { contains: query, mode: "insensitive" } }] : [])] },
      include: { translations: true,
        ...(kind === "categories" ? { values: { include: { translations: true } }, infoCards: { include: { translations: true } } } : {}),
        ...(kind === "super-categories" ? { blocks: { include: { translations: true } } } : {}),
      },
      orderBy: { id: "asc" }, take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    return NextResponse.json({ items: page.map(row => contentReadiness(kind, row)), nextCursor: rows.length > 50 ? page.at(-1)?.id : null, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر فحص جاهزية المحتوى. أعد المحاولة." }, { status: 503 });
  }
}
