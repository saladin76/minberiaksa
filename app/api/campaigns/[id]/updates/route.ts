// app/api/campaigns/[id]/updates/route.ts
// High-performance campaign updates endpoint with multi-language support
// GET /api/campaigns/[id]/updates - Get all updates for a campaign
// POST /api/campaigns/[id]/updates - Create new update (admin only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";

type ParamsPromise = { params: Promise<{ id: string }> };

// ✅ GET - Fetch campaign updates with translations
export async function GET(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { id } = await params;
    const locale = request.headers.get("x-locale") || "ar";

    // ✅ Performance optimization: Fetch only needed fields with locale-specific translations
    const updates = await prisma.update.findMany({
      where: {
        campaignId: id,
      },
      select: {
        id: true,
        title: true,        // Arabic default
        description: true,  // Arabic default
        image: true,
        videoUrl: true,
        createdAt: true,
        
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
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limit to prevent huge payloads
    });

    // Transform: requested locale → English → Arabic (base)
    const transformedUpdates = updates.map((update) => {
      const t = pickTranslation(update.translations, locale);
      return {
        id: update.id,
        title: t?.title || update.title,
        description: t?.description || update.description,
        image: update.image,
        videoUrl: update.videoUrl,
        createdAt: update.createdAt.toISOString(),
      };
    });

    return NextResponse.json(transformedUpdates, {
      headers: {
        // Cache for 2 minutes
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    });
    
  } catch (error) {
    console.error("Error fetching updates:", error);
    return NextResponse.json(
      { error: "Failed to fetch updates" },
      { status: 500 }
    );
  }
}

// ✅ POST - Create new update with translations (admin only)
export async function POST(request: NextRequest, { params }: ParamsPromise) {
  try {
    const { id } = await params;
    // ✅ STEP 1: Authentication check
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "campaigns");
    if (denied) return denied;
    const data = await request.json();

    // ✅ STEP 2: Validate campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // ✅ STEP 3: Validate required fields
    if (!data.title || !data.description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      );
    }

    // ✅ STEP 4: Prepare translation data
    // Expected format: { translations: { en: { title, description }, fr: {...} } }
    const translationData: { locale: string; title: string; description: string }[] = [];
    
    if (data.translations && typeof data.translations === 'object') {
      for (const [locale, trans] of Object.entries(data.translations)) {
        if (locale !== 'ar' && trans && typeof trans === 'object') {
          const t = trans as any;
          if (t.title && t.description) {
            translationData.push({
              locale,
              title: t.title,
              description: t.description,
            });
          }
        }
      }
    }

    // ✅ STEP 5: Create update + translations in a single nested write.
    // The interactive transaction plus the follow-up findUnique cost three
    // round trips to do what Prisma performs atomically in one.
    const fullUpdate = await prisma.update.create({
      data: {
        title: data.title,
        description: data.description,
        image: data.image || null,
        videoUrl: data.videoUrl || null,
        campaignId: id,
        ...(translationData.length > 0
          ? {
              translations: {
                create: translationData.map((t) => ({
                  locale: t.locale,
                  title: t.title,
                  description: t.description,
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
      action: "CAMPAIGN_UPDATE_POST_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أضاف تحديثًا للمشروع «${campaign.title}»: ${fullUpdate.title}`,
      entityType: "Update",
      entityId: fullUpdate.id,
      metadata: { campaignId: id },
    });

    return NextResponse.json(fullUpdate, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });

  } catch (error) {
    console.error("Error creating update:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إضافة التحديث") },
      { status: 500 }
    );
  }
}

// ✅ Cache revalidation: 2 minutes
export const revalidate = 120;