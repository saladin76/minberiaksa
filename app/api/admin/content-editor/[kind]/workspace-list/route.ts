import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { fingerprint, documentFor } from "@/lib/content-editor/service";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
import {
  campaignWorkspaceWhere,
  HAS_IMPACT_BACKING_CAMPAIGNS,
} from "@/lib/content-editor/site-capabilities";
import type { Delegate } from "@/lib/content-editor/service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ kind: string }> };
async function access(ctx: Context) {
  if ((await ctx.params).kind !== "campaigns")
    return {
      session: null,
      denied: NextResponse.json({ error: "غير موجود" }, { status: 404 }),
    };
  const session = await getServerSession(authOptions);
  return {
    session,
    denied: requireAdminOrDashboardPermission(session, "campaigns"),
  };
}
const version = (row: { editorVersion: string | null; updatedAt: Date }) =>
  fingerprint([row.editorVersion, row.updatedAt]);
export async function GET(req: NextRequest, ctx: Context) {
  const { denied } = await access(ctx);
  if (denied) return denied;
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (cursor && !/^[a-f0-9]{24}$/i.test(cursor))
    return NextResponse.json({ error: "مؤشر غير صالح" }, { status: 400 });
  try {
    const rows = await prisma.campaign.findMany({
      where: campaignWorkspaceWhere(),
      include: {
        translations: true,
        categories: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 100);
    return NextResponse.json(
      {
        items: page.map((row) => ({
          id: row.id,
          title: row.title,
          searchTitles: row.translations.map((t) => t.title),
          image: row.images[0] || "",
          priority: row.priority || 0,
          isActive: row.isActive,
          archived: row.editorArchived === true,
          targetAmount: row.targetAmount,
          currentAmount: row.currentAmount,
          goalType: row.goalType,
          categories: row.categories,
          revision: version(row),
          statuses: documentFor("campaigns", row).statuses,
        })),
        nextCursor: rows.length > 100 ? page.at(-1)?.id : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "تعذر تحميل المشاريع" }, { status: 503 });
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  const { session, denied } = await access(ctx);
  if (denied) return denied;
  try {
    const body = await req.json();
    if (
      !["enable", "disable", "archive", "restore", "order"].includes(
        body.action,
      ) ||
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 50
    )
      throw new Error("طلب غير صالح");
    const seen = new Set<string>();
    for (const item of body.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !/^[a-f0-9]{24}$/i.test(item.id) ||
        typeof item.revision !== "string" ||
        seen.has(item.id)
      )
        throw new Error("اختيار غير صالح");
      seen.add(item.id);
      if (
        body.action === "order" &&
        (!Number.isInteger(item.order) ||
          item.order < 0 ||
          item.order > 1000000)
      )
        throw new Error("ترتيب غير صالح");
    }
    await prisma.$transaction(
      async (tx) => {
        for (const item of body.items) {
          const row = await tx.campaign.findUnique({ where: { id: item.id } });
          if (
            HAS_IMPACT_BACKING_CAMPAIGNS &&
            (await (
              tx as unknown as Record<string, Delegate>
            ).impactCampaign.findFirst({
              where: { campaignId: item.id },
              select: { id: true },
            }))
          )
            throw new Error("مشاريع تسوية الأثر تُدار من محرر الأثر");
          if (!row || row.isDeleted || version(row) !== item.revision)
            throw new Error("CONFLICT");
          await tx.campaign.update({
            where: { id: row.id },
            data:
              body.action === "order"
                ? { priority: item.order, editorVersion: crypto.randomUUID() }
                : {
                    isActive:
                      body.action === "enable" || body.action === "restore",
                    editorArchived: body.action === "archive",
                    editorVersion: crypto.randomUUID(),
                  },
          });
        }
      },
      { maxWait: 10000, timeout: 30000 },
    );
    queueAuditLog({
      ...auditActorFromDashboardSession(session!),
      action: "CAMPAIGN_WORKSPACE_BULK",
      entityType: "Campaign",
      messageAr: "تحديث حالة أو ترتيب المشاريع من مساحة التحرير",
      metadata: { action: body.action, ids: [...seen] },
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const conflict = error instanceof Error && error.message === "CONFLICT";
    return NextResponse.json(
      {
        error: conflict
          ? "تغير أحد المشاريع. لم يُعتمد أي تعديل؛ أعد التحميل."
          : error instanceof Error &&
              ["طلب غير صالح", "اختيار غير صالح", "ترتيب غير صالح"].includes(
                error.message,
              )
            ? error.message
            : "تعذر حفظ التعديل؛ لم يُعتمد الطلب.",
      },
      { status: conflict ? 409 : 400 },
    );
  }
}
