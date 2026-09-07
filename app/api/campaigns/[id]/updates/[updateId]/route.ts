// app/api/campaigns/[id]/updates/[updateId]/route.ts
// High-performance individual update operations with translations
// GET /api/campaigns/[id]/updates/[updateId] - Get specific update
// PATCH /api/campaigns/[id]/updates/[updateId] - Update an update (admin only)
// DELETE /api/campaigns/[id]/updates/[updateId] - Delete an update (admin only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

type ParamsPromise = { params: Promise<{ id: string; updateId: string }> };

// ✅ GET - Fetch specific update with translations
export async function GET(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { updateId } = await params;
    const locale = request.headers.get("x-locale") || "ar";

    const update = await prisma.update.findUnique({
      where: { id: updateId },
      select: {
        id: true,
        title: true,        // Arabic default
        description: true,  // Arabic default
        image: true,
        videoUrl: true,
        createdAt: true,
        campaignId: true,
        
        // Fetch requested locale + English (fallback chain)
        translations: {
          where: translationLocaleWhere(locale),
          select: {
            locale: true,
            title: true,
            description: true,
          },
          take: 2,
        },
      },
    });

    if (!update) {
      return NextResponse.json(
        { error: "Update not found" },
        { status: 404 }
      );
    }

    const t = pickTranslation(update.translations, locale);

    // Transform: requested locale → English → Arabic (base)
    const transformedUpdate = {
      id: update.id,
      title: t?.title || update.title,
      description: t?.description || update.description,
      image: update.image,
      videoUrl: update.videoUrl,
      campaignId: update.campaignId,
      createdAt: update.createdAt.toISOString(),
    };

    return NextResponse.json(transformedUpdate, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
    
  } catch (error) {
    console.error("Error fetching update:", error);
    return NextResponse.json(
      { error: "Failed to fetch update" },
      { status: 500 }
    );
  }
}

// ✅ PATCH - Update an update with translations (admin only)
export async function PATCH(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { updateId } = await params;
    // ✅ STEP 1: Authentication check
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;
    const data = await request.json();

    // ✅ STEP 2: Validate update exists
    const existingUpdate = await prisma.update.findUnique({
      where: { id: updateId },
      select: { id: true, title: true, campaignId: true },
    });

    if (!existingUpdate) {
      return NextResponse.json(
        { error: "Update not found" },
        { status: 404 }
      );
    }

    // ✅ STEP 3: Prepare update data
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.image !== undefined) updateData.image = data.image;
    if (data.videoUrl !== undefined) updateData.videoUrl = data.videoUrl;

    // ✅ STEP 4: Prepare translation updates
    // Expected format: { translations: { en: { title, description }, fr: {...} } }
    const translationUpdates: { locale: string; data: any }[] = [];

    if (data.translations && typeof data.translations === 'object') {
      for (const [locale, trans] of Object.entries(data.translations)) {
        if (locale !== 'ar' && trans && typeof trans === 'object') {
          const translationData: any = {};
          const t = trans as any;
          
          if (t.title !== undefined) translationData.title = t.title;
          if (t.description !== undefined) translationData.description = t.description;

          // Only add if there's data to update
          if (Object.keys(translationData).length > 0) {
            translationUpdates.push({ locale, data: translationData });
          }
        }
      }
    }

    // ✅ STEP 5: One nested write.
    // This was an interactive `$transaction` containing an awaited upsert per
    // locale, then a separate findUnique to re-read what had just been written.
    // With 7 locales that is ~9 sequential round trips; Prisma does the same
    // work atomically in one, and `select` hands back the finished row.
    const fullUpdate = await prisma.update.update({
      where: { id: updateId },
      data: {
        ...updateData,
        ...(translationUpdates.length
          ? {
              translations: {
                upsert: translationUpdates.map(({ locale, data: transData }) => ({
                  where: { updateId_locale: { updateId, locale } },
                  update: transData,
                  create: { locale, ...transData },
                })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        videoUrl: true,
        campaignId: true,
        createdAt: true,
        translations: {
          select: {
            locale: true,
            title: true,
            description: true,
          },
        },
      },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "CAMPAIGN_UPDATE_EDIT",
      messageAr: `${actor.actorName ?? "مسؤول"} عدّل تحديث المشروع: ${fullUpdate.title ?? existingUpdate.title}`,
      entityType: "Update",
      entityId: updateId,
      metadata: { campaignId: fullUpdate.campaignId },
    });

    return NextResponse.json(fullUpdate, { headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    console.error("Error updating update:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حفظ التحديث") },
      { status: 500 }
    );
  }
}

// ✅ DELETE - Delete update and all its translations (admin only)
export async function DELETE(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { updateId } = await params;
    // ✅ STEP 1: Authentication check
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;

    // ✅ STEP 2+3: Delete and read in one call — `delete` returns the row, so the
    // preceding existence check was a round trip spent on data the delete itself
    // hands back. A missing row now surfaces as P2025 and is mapped to a 404
    // below. UpdateTranslation rows cascade (onDelete: Cascade).
    const existingUpdate = await prisma.update.delete({
      where: { id: updateId },
      select: { id: true, campaignId: true, title: true },
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "CAMPAIGN_UPDATE_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف تحديثًا من المشروع: ${existingUpdate.title}`,
      entityType: "Update",
      entityId: updateId,
      metadata: { campaignId: existingUpdate.campaignId },
    });

    return NextResponse.json({ 
      success: true,
      message: "Update deleted successfully",
      campaignId: existingUpdate.campaignId,
    });
    
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Update not found" }, { status: 404 });
    }
    console.error("Error deleting update:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف التحديث") },
      { status: 500 }
    );
  }
}

// ✅ Cache revalidation
export const revalidate = 300;