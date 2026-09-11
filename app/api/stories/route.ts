import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { queueAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";
import { pickTranslation, translationLocaleWhere } from "@/lib/i18n/translation-fallback";
import { writeErrorMessage } from "@/lib/dashboard/write-error-message";
import {
  STORY_WITH_TRANSLATIONS_SELECT,
  buildStoryScalars,
  parseStorySlides,
  parseStoryTranslations,
  slidesCreateData,
  storyLiveWhere,
} from "@/lib/content/story-write";
import { resolveStoryCta, type StoryCtaLookups } from "@/lib/content/story-cta";

/**
 * GET  /api/stories — the public rail: active stories inside their window,
 *      each with its slides, captions in the caller's locale, and every CTA
 *      already resolved to an href for that locale.
 * POST /api/stories — create, dashboard only.
 */
export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get("locale") || "ar";

    const rows = await prisma.story.findMany({
      where: storyLiveWhere(),
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        image: true,
        order: true,
        translations: {
          where: translationLocaleWhere(locale),
          take: 2,
          select: { locale: true, title: true },
        },
        slides: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            mediaType: true,
            mediaUrl: true,
            durationSeconds: true,
            caption: true,
            ctaLabel: true,
            ctaKind: true,
            ctaValue: true,
            translations: {
              where: translationLocaleWhere(locale),
              take: 2,
              select: { locale: true, caption: true, ctaLabel: true },
            },
          },
        },
      },
    });

    /* CTA targets are ids; the hrefs need each target's slug in THIS locale.
       One query per target type for the whole rail, not one per slide. */
    const campaignIds = new Set<string>();
    const postIds = new Set<string>();
    for (const s of rows) for (const sl of s.slides) {
      if (sl.ctaKind === "CAMPAIGN" && sl.ctaValue) campaignIds.add(sl.ctaValue);
      if (sl.ctaKind === "POST" && sl.ctaValue) postIds.add(sl.ctaValue);
    }
    const [campaigns, posts] = await Promise.all([
      campaignIds.size
        ? prisma.campaign.findMany({
            where: { id: { in: [...campaignIds] }, isActive: true },
            select: { id: true, slug: true, translations: { where: { locale }, select: { slug: true }, take: 1 } },
          })
        : [],
      postIds.size
        ? prisma.post.findMany({
            where: { id: { in: [...postIds] }, published: true },
            select: { id: true, slug: true, translations: { where: { locale }, select: { slug: true }, take: 1 } },
          })
        : [],
    ]);
    const lookups: StoryCtaLookups = {
      campaignSlugById: new Map(campaigns.map((c) => [c.id, c.translations[0]?.slug || c.slug || c.id])),
      postSlugById: new Map(posts.map((p) => [p.id, p.translations[0]?.slug || p.slug || p.id])),
    };

    const items = rows
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        title: pickTranslation(s.translations, locale)?.title ?? s.title,
        image: s.image,
        order: s.order,
        slides: s.slides.map((sl) => {
          const t = pickTranslation(sl.translations, locale);
          const cta = sl.ctaKind && sl.ctaValue ? { kind: sl.ctaKind, value: sl.ctaValue } : null;
          return {
            id: sl.id,
            mediaType: sl.mediaType,
            mediaUrl: sl.mediaUrl,
            durationSeconds: sl.durationSeconds,
            caption: t?.caption || sl.caption || "",
            ctaLabel: t?.ctaLabel || sl.ctaLabel || "",
            /* Null when the target is gone — the viewer hides the button
               rather than sending anyone to a 404. */
            ctaHref: resolveStoryCta(cta, locale, lookups),
          };
        }),
      }))
      /* A story with no slides has nothing to open; keep it off the rail. */
      .filter((s) => s.slides.length > 0);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: "Failed to fetch stories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const data = await request.json();
    const scalars = buildStoryScalars(data);
    if (!scalars.title) {
      return NextResponse.json({ error: "العنوان بالعربية مطلوب" }, { status: 400 });
    }
    if (!scalars.slug) {
      return NextResponse.json({ error: "المعرّف (slug) مطلوب" }, { status: 400 });
    }
    if (!scalars.image) {
      return NextResponse.json({ error: "صورة القصة مطلوبة" }, { status: 400 });
    }

    const slides = parseStorySlides(data.slides) ?? [];
    /* A story is its slides. One with none would render as a ring that opens
       onto nothing, so it is refused here rather than filtered out later. */
    if (slides.length === 0) {
      return NextResponse.json({ error: "أضف شريحة واحدة على الأقل" }, { status: 400 });
    }

    const { write } = parseStoryTranslations(data.translations);

    const full = await prisma.story.create({
      data: {
        ...scalars,
        ...(write.length ? { translations: { create: write } } : {}),
        slides: { create: slidesCreateData(slides) },
      },
      select: STORY_WITH_TRANSLATIONS_SELECT,
    });

    const actor = auditActorFromDashboardSession(session!);
    queueAuditLog({
      ...actor,
      action: "STORY_CREATE",
      messageAr: `${actor.actorName ?? "مسؤول"} أنشأ قصة: ${full.title} (${slides.length} شريحة)`,
      entityType: "Story",
      entityId: full.id,
    });

    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    console.error("Error creating story:", error);
    return NextResponse.json(
      { error: writeErrorMessage(error, "تعذّر إنشاء القصة") },
      { status: 500 }
    );
  }
}
