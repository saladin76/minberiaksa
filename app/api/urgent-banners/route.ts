import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
  buildUrgentBannerScalars,
  parseUrgentBannerTranslations,
} from "@/lib/content/urgent-banner-write";
import { listBanners } from "@/lib/minbar/banners";
import type { BannerSlotKey } from "@/lib/minbar/banner-placements";

/**
 * GET  /api/urgent-banners?locale=&page=&slot= — the live banners for one slot
 *      of one page, resolved for the locale, in drag order. This is what the
 *      site's `<PageBanners>` reads on the server; it is public so a client
 *      can read the same list.
 * POST /api/urgent-banners — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const locale = q.get("locale") || "ar";
    const page = q.get("page") || "home";
    const slot = (q.get("slot") || "top") as BannerSlotKey;
    if (!["top", "middle", "bottom"].includes(slot)) {
      return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
    }
    const items = await listBanners(locale, page, slot);
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

    /* New banners go to the end of the order. */
    const last = await prisma.urgentBanner.findFirst({ orderBy: { priority: "desc" }, select: { priority: true } });
    const priority = (last?.priority ?? -1) + 1;

    const full = await prisma.urgentBanner.create({
      data: { ...scalars, priority, ...(write.length ? { translations: { create: write } } : {}) },
      select: URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "URGENT_BANNER_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ بانرًا: ${full.title}`,
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
