import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import { contentStore } from "@/lib/content-editor/store";
import { documentFor, includeFor } from "@/lib/content-editor/service";
import { campaignWorkspaceWhere } from "@/lib/content-editor/site-capabilities";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ kind: string }> },
) {
  const kind = parseKind((await ctx.params).kind);
  if (!kind)
    return NextResponse.json({ error: "قسم غير صالح" }, { status: 404 });
  const session = await getServerSession(authOptions),
    denied = requireAdminOrDashboardPermission(
      session,
      CONFIG[kind].permission,
    );
  if (denied) return denied;
  try {
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor && !/^[a-f0-9]{24}$/i.test(cursor))
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    const items = await contentStore.model(CONFIG[kind].model).findMany({
      where: kind === "campaigns" ? campaignWorkspaceWhere() : {},
      include: includeFor(kind),
      orderBy: { id: "asc" },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return NextResponse.json(
      {
        items: items.slice(0, 50).map((row) => {
          const doc = documentFor(kind, row);
          return { id: doc.id, title: doc.title, statuses: doc.statuses };
        }),
        nextCursor: items.length > 50 ? items[49].id : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("content-editor list", error);
    return NextResponse.json(
      { error: "تعذر تحميل إحصاءات اللغات" },
      { status: 500 },
    );
  }
}
