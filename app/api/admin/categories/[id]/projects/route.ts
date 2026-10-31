import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  requireAdminOrDashboardPermission,
  requireAdminSession,
} from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import {
  contentWriteWhere,
  contentVersionPatch,
} from "@/lib/content-editor/legacy-write";
import { revalidatePath } from "next/cache";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(_request: NextRequest, ctx: Context) {
  const denied = requireAdminOrDashboardPermission(
    await getServerSession(authOptions),
    "categories",
  );
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/i.test(id))
    return reply({ error: "INVALID_CATEGORY" }, 400);
  try {
    const category = await prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
        campaignIds: true,
        editorVersion: true,
      },
    });
    if (!category) return reply({ error: "NOT_FOUND" }, 404);
    const [projects, donations, subscriptions, programmeReferences] =
      await Promise.all([
        prisma.campaign.findMany({
          where: {
            OR: [
              { categoryIds: { has: id } },
              { id: { in: category.campaignIds } },
            ],
          },
          select: {
            id: true,
            title: true,
            isActive: true,
            isDeleted: true,
            categoryIds: true,
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.donationCategoryItem.count({ where: { categoryId: id } }),
        prisma.subscriptionCategoryItem.count({ where: { categoryId: id } }),
        prisma.superCategoryItem.count({ where: { refId: id } }),
      ]);
    return reply({
      category: { ...category, editorVersion: category.editorVersion ?? null },
      projects,
      references: { donations, subscriptions, programmeReferences },
      canDetachAndDelete:
        category.isActive === false &&
        !donations &&
        !subscriptions &&
        !programmeReferences,
    });
  } catch {
    return reply({ error: "CATEGORY_PROJECTS_UNAVAILABLE" }, 503);
  }
}
export async function DELETE(request: NextRequest, ctx: Context) {
  const session = await getServerSession(authOptions),
    denied = requireAdminSession(session);
  if (denied) return denied;
  const { id } = await ctx.params,
    body = await request.json().catch(() => null);
  if (
    !/^[a-f0-9]{24}$/i.test(id) ||
    typeof body?.confirmation !== "string" ||
    !(body.editorVersion === null || typeof body.editorVersion === "string")
  )
    return reply({ error: "CONFIRM_CATEGORY_DELETE" }, 400);
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const category = await tx.category.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            isActive: true,
            editorVersion: true,
            campaignIds: true,
          },
        });
        if (
          !category ||
          category.isActive !== false ||
          body.confirmation !== category.name ||
          (category.editorVersion ?? null) !== body.editorVersion
        )
          return { error: "CATEGORY_CHANGED_RELOAD" };
        const refs = await Promise.all([
          tx.donationCategoryItem.count({ where: { categoryId: id } }),
          tx.subscriptionCategoryItem.count({ where: { categoryId: id } }),
          tx.superCategoryItem.count({ where: { refId: id } }),
        ]);
        if (refs.some(Boolean))
          return { error: "CATEGORY_HAS_FINANCIAL_OR_PAGE_REFERENCES" };
        const changed = await tx.$runCommandRaw({
          update: "Campaign",
          updates: [
            {
              q: {
                $or: [
                  { categoryIds: { $oid: id } },
                  {
                    _id: {
                      $in: category.campaignIds.map((value) => ({
                        $oid: value,
                      })),
                    },
                  },
                ],
              },
              u: {
                $pull: { categoryIds: { $oid: id } },
                $unset: { [`categoryPriorities.${id}`]: "" },
                $set: { updatedAt: { $date: new Date().toISOString() } },
              },
              multi: true,
            },
          ],
        });
        if (changed.ok !== 1 || changed.writeErrors)
          throw new Error("DETACH_FAILED");
        await tx.category.update({
          where: contentWriteWhere(
            { id },
            { expectedEditorVersion: category.editorVersion ?? null },
          ),
          data: { campaignIds: [], ...contentVersionPatch() },
        });
        await tx.category.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            actorId: session!.user.id,
            actorName: session!.user.name,
            actorRole: "ADMIN",
            action: "CATEGORY_DETACH_DELETE",
            entityType: "Category",
            entityId: id,
            stream: "TEAM",
            messageAr: "حذف تصنيف مؤرشف وفك ارتباط المشاريع مع إبقاء سجلاتها",
            metadata: {
              detachedProjects: changed.nModified || 0,
              projectsDeleted: 0,
              financialRecordsChanged: false,
            },
          },
        });
        return { ok: true, detached: Number(changed.nModified || 0) };
      },
      { maxWait: 10000, timeout: 30000 },
    );
    if (result.error) return reply(result, 409);
    revalidatePath("/", "layout");
    return reply(result);
  } catch {
    return reply({ error: "CATEGORY_DELETE_FAILED" }, 503);
  }
}
