import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
  buildUrgentBannerScalarPatch,
  parseUrgentBannerTranslations,
} from "@/lib/content/urgent-banner-write";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const banner = await prisma.urgentBanner.findUnique({
      where: { id },
      select: URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
    });
    if (!banner) return NextResponse.json({ error: "Banner not found" }, { status: 404 });

    return NextResponse.json(banner);
  } catch (error) {
    console.error("Error fetching urgent banner:", error);
    return NextResponse.json({ error: "Failed to fetch urgent banner" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const body = (await request.json()) as Record<string, unknown>;
    const patch = buildUrgentBannerScalarPatch(body);

    const { write, clear } =
      body.translations === undefined
        ? { write: [], clear: [] as string[] }
        : parseUrgentBannerTranslations(body.translations);

    const full = await prisma.urgentBanner.update({
      where: { id },
      data: {
        ...patch,
        ...(write.length || clear.length
          ? {
              translations: {
                ...(write.length
                  ? {
                      upsert: write.map((t) => ({
                        where: { urgentBannerId_locale: { urgentBannerId: id, locale: t.locale } },
                        create: {
                          locale: t.locale,
                          title: t.title,
                          description: t.description,
                          ctaLabel: t.ctaLabel,
                          kicker: t.kicker,
                          ctaSecondaryLabel: t.ctaSecondaryLabel,
                          amountLabels: t.amountLabels,
                        },
                        update: {
                          title: t.title,
                          description: t.description,
                          ctaLabel: t.ctaLabel,
                          kicker: t.kicker,
                          ctaSecondaryLabel: t.ctaSecondaryLabel,
                          amountLabels: t.amountLabels,
                        },
                      })),
                    }
                  : {}),
                ...(clear.length ? { deleteMany: { locale: { in: clear } } } : {}),
              },
            }
          : {}),
      },
      select: URGENT_BANNER_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "URGENT_BANNER_UPDATE",
      messageAr: `${actor.actorName ?? "مسؤول"} حدّث بانر طوارئ: ${full.title}`,
      entityType: "UrgentBanner",
      entityId: full.id,
    });

    return NextResponse.json(full);
  } catch (error) {
    console.error("Error updating urgent banner:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر تحديث البانر") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const existing = await prisma.urgentBanner.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) return NextResponse.json({ error: "Banner not found" }, { status: 404 });

    // Translations cascade from the schema.
    await prisma.urgentBanner.delete({ where: { id } });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "URGENT_BANNER_DELETE",
      messageAr: `${actor.actorName ?? "مسؤول"} حذف بانر طوارئ: ${existing.title}`,
      entityType: "UrgentBanner",
      entityId: existing.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting urgent banner:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر حذف البانر") },
      { status: 500 }
    );
  }
}
