import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { SLIDE_WITH_TRANSLATIONS_SELECT, buildSlideScalars, parseSlideTranslations } from "@/lib/slides/slide-write";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const locale = params.get('locale') || 'ar';
    const activeOnly = params.get('active') !== 'false';

    const slides = await prisma.slide.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { order: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        showButton: true,
        buttonText: true,
        buttonLink: true,
        order: true,
        translations: { where: translationLocaleWhere(locale), take: 2, select: { locale: true, title: true, description: true, buttonText: true } },
      },
    });

    const items = slides.map(s => {
      const t = pickTranslation(s.translations, locale);
      return {
        id: s.id,
        title: t?.title ?? s.title,
        description: t?.description ?? s.description ?? '',
        image: s.image,
        showButton: s.showButton,
        buttonText: t?.buttonText ?? s.buttonText ?? '',
        buttonLink: s.buttonLink ?? '#quick_donate',
        order: s.order,
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching slides:', error);
    return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, 'slides');
    if (denied) return denied;
    const data = await request.json();
    const scalars = buildSlideScalars(data);
    if (!scalars.title) return NextResponse.json({ error: 'العنوان بالعربية مطلوب' }, { status: 400 });

    const { write } = parseSlideTranslations(data.translations);

    // One nested write instead of an interactive transaction plus a refetch:
    // Prisma makes the parent + children atomic on its own, and `select`
    // returns the finished row so there is nothing left to re-read.
    const full = await prisma.slide.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
      },
      select: SLIDE_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "SLIDE_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ شريحة هيرو: ${full.title}`,
      entityType: "Slide",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error('Error creating slide:', error);
    return NextResponse.json({ error: writeErrorMessage(error, 'تعذّر إنشاء الشريحة') }, { status: 500 });
  }
}
