import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { prisma } from "@/lib/prisma";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/blog/health — what the production database actually holds.
 *
 * A committed seed or import script is not proof the live database changed.
 * After any bulk blog operation this is the number to check: counts come from
 * the database this deployment is connected to, at request time.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "blog");
  if (denied) return denied;

  const blank = (field: "content" | "image") => ({
    OR: [{ [field]: null }, { [field]: "" }, { [field]: { isSet: false } }],
  });

  try {
    const [total, published, emptyBody, missingImage, translations, emptyTranslationBody, latest] = await Promise.all([
      prisma.post.count(),
      prisma.post.count({ where: { published: true } }),
      prisma.post.count({ where: blank("content") }),
      prisma.post.count({ where: blank("image") }),
      prisma.postTranslation.count(),
      prisma.postTranslation.count({ where: blank("content") }),
      prisma.post.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    ]);
    return NextResponse.json({
      total,
      published,
      emptyBody,
      missingImage,
      translations,
      emptyTranslationBody,
      lastUpdatedAt: latest?.updatedAt ?? null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/admin/blog/health", error);
    return NextResponse.json({ error: "Failed to read blog health" }, { status: 500 });
  }
}
