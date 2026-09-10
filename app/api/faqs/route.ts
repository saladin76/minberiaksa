import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  FAQ_WITH_TRANSLATIONS_SELECT,
  buildFaqScalars,
  parseFaqTranslations,
} from "@/lib/content/faq-write";

/**
 * GET  /api/faqs — the public list. `?page=` narrows to one page of the site;
 *      entries with no page are general and are always included.
 * POST /api/faqs — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";
    const page = request.nextUrl.searchParams.get("page");

    const rows = await prisma.faq.findMany({
      where: {
        isActive: true,
        ...(page ? { OR: [{ page }, { page: null }] } : {}),
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        question: true,
        answer: true,
        page: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, question: true, answer: true },
        },
      },
    });

    const items = rows.map((f) => {
      const t = pickTranslation(f.translations, locale);
      return {
        id: f.id,
        question: t?.question ?? f.question,
        /* Falls back per field: a half-translated row is better shown with the
           Arabic answer than with an empty one. */
        answer: t?.answer || f.answer,
        page: f.page ?? "",
        order: f.order,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching faqs:", error);
    return NextResponse.json({ error: "Failed to fetch faqs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildFaqScalars(data);
    if (!scalars.question) {
      return NextResponse.json({ error: "السؤال بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.answer) {
      return NextResponse.json({ error: "الإجابة بالعربية مطلوبة" }, { status: 400 });
    }

    const { write } = parseFaqTranslations(data.translations);

    const full = await prisma.faq.create({
      data: { ...scalars, ...(write.length ? { translations: { create: write } } : {}) },
      select: FAQ_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "FAQ_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أضاف سؤالًا شائعًا: ${full.question}`,
      entityType: "Faq",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating faq:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء السؤال") },
      { status: 500 }
    );
  }
}
