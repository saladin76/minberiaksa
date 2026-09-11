import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
  buildUrgentBannerScalars,
  parseUrgentBannerTranslations,
  urgentBannerLiveWhere,
} from "@/lib/content/urgent-banner-write";

/**
 * GET  /api/urgent-banners — live banners for one locale, highest priority first.
 *      The site typically shows only the first; the rest are returned so it can
 *      choose to rotate.
 * POST /api/urgent-banners — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.urgentBanner.findMany({
      where: urgentBannerLiveWhere(locale),
      orderBy: { priority: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        image: true,
        ctaLabel: true,
        ctaUrl: true,
        campaignId: true,
        suggestedAmounts: true,
        priority: true,
        endsAt: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true, description: true, ctaLabel: true },
        },
      },
    });

    const items = rows.map((b) => {
      const t = pickTranslation(b.translations, locale);
      return {
        id: b.id,
        slug: b.slug,
        title: t?.title ?? b.title,
        description: t?.description || b.description || "",
        image: b.image ?? "",
        ctaLabel: t?.ctaLabel || b.ctaLabel || "",
        ctaUrl: b.ctaUrl ?? "",
        campaignId: b.campaignId ?? null,
        suggestedAmounts: b.suggestedAmounts,
        priority: b.priority,
        endsAt: b.endsAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching urgent banners:", error);
    return NextResponse.json({ error: "Failed to fetch urgent banners" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildUrgentBannerScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    /* A banner must lead somewhere: a campaign, or an explicit URL. */
    if (!scalars.campaignId && !scalars.ctaUrl) {
      return NextResponse.json(
        { error: "اربط البانر بحملة أو أدخل رابطًا للزر" },
        { status: 400 }
      );
    }

    const { write } = parseUrgentBannerTranslations(data.translations);

    const full = await prisma.urgentBanner.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "URGENT_BANNER_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ بانر طوارئ: ${full.title}`,
      entityType: "UrgentBanner",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating urgent banner:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء البانر") },
      { status: 500 }
    );
  }
}
