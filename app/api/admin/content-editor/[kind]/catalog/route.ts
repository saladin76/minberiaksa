import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { CONFIG, parseKind } from "@/lib/content-editor/contracts";
import { prisma } from "@/lib/prisma";
import {
  campaignWorkspaceWhere,
  HAS_CATEGORY_PAGE_LIBRARY,
} from "@/lib/content-editor/site-capabilities";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ kind: string }> },
) {
  const kind = parseKind((await ctx.params).kind);
  if (!kind)
    return NextResponse.json({ error: "قسم غير صالح" }, { status: 404 });
  const denied = requireAdminOrDashboardPermission(
    await getServerSession(authOptions),
    CONFIG[kind].permission,
  );
  if (denied) return denied;
  try {
    const [categories, campaigns, postCategories, posts] = await Promise.all([
      kind === "campaigns"
        ? prisma.category.findMany({ select: { id: true, name: true } })
        : [],
      ["categories", "blog", "super-categories", "urgent-banners"].includes(
        kind,
      )
        ? prisma.campaign.findMany({
            where: campaignWorkspaceWhere(),
            select: {
              id: true,
              title: true,
              isActive: true,
              categoryIds: true,
              priority: true,
            },
          })
        : [],
      kind === "blog"
        ? prisma.postCategory.findMany({ select: { id: true, name: true } })
        : [],
      kind === "super-categories"
        ? prisma.post.findMany({
            select: { id: true, title: true, published: true },
          })
        : [],
    ]);
    return NextResponse.json({
      hasCategoryLibrary: HAS_CATEGORY_PAGE_LIBRARY && kind === "categories",
      categories: categories.map((x) => ({ id: x.id, title: x.name })),
      campaigns,
      postCategories: postCategories.map((x) => ({ id: x.id, title: x.name })),
      linked: {
        CAMPAIGN: campaigns.map((x) => ({
          id: x.id,
          title: x.title,
          live: x.isActive,
        })),
        POST: posts.map((x) => ({
          id: x.id,
          title: x.title || "دون عنوان",
          live: x.published,
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "تعذر تحميل قوائم المحتوى" },
      { status: 503 },
    );
  }
}
