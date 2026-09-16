import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { sessionHasDashboardPermission } from "@/lib/dashboard/permissions";

/**
 * GET /api/super-categories/content-options — everything a super category can
 * link, by kind, for the dashboard picker.
 *
 * The picker stores ids, so it has to be able to show a name for each. Seven
 * small queries in parallel are cheaper than seven round trips from the form,
 * and one response keeps the picker from rendering half-populated. Inactive and
 * unpublished rows are included and flagged rather than hidden: an editor
 * building a page before its campaign goes live still has to be able to pick it.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    /* The category form reads this list too, for its achievements picker and its
       donation target, and category staff hold "categories" rather than
       "siteContent". Either grants a read of what is already visible on the site. */
    if (!sessionHasDashboardPermission(session, "siteContent") && !sessionHasDashboardPermission(session, "categories")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [campaigns, posts, videos, playlists, courses, reports, booklets] = await Promise.all([
      prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        take: 400,
        select: { id: true, title: true, slug: true, isActive: true },
      }),
      prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 400,
        select: { id: true, title: true, slug: true, published: true },
      }),
      prisma.video.findMany({
        orderBy: { order: "asc" },
        select: { id: true, title: true, slug: true, type: true, isActive: true },
      }),
      prisma.videoPlaylist.findMany({
        orderBy: { order: "asc" },
        select: { id: true, title: true, slug: true, kind: true, isActive: true },
      }),
      prisma.course.findMany({
        orderBy: { order: "asc" },
        select: { id: true, title: true, slug: true, kind: true, isActive: true },
      }),
      prisma.report.findMany({
        orderBy: { order: "asc" },
        select: { id: true, title: true, slug: true, year: true, isPublished: true },
      }),
      prisma.booklet.findMany({
        orderBy: { order: "asc" },
        select: { id: true, title: true, slug: true, author: true, isPublished: true },
      }),
    ]);

    return NextResponse.json({
      CAMPAIGN: campaigns.map((r) => ({
        id: r.id,
        title: r.title,
        hint: r.slug ?? "",
        live: r.isActive,
      })),
      POST: posts.map((r) => ({
        id: r.id,
        title: r.title || r.slug || "—",
        hint: r.slug ?? "",
        live: r.published,
      })),
      VIDEO: videos.map((r) => ({ id: r.id, title: r.title, hint: r.type, live: r.isActive })),
      PLAYLIST: playlists.map((r) => ({ id: r.id, title: r.title, hint: r.kind, live: r.isActive })),
      COURSE: courses.map((r) => ({ id: r.id, title: r.title, hint: r.kind, live: r.isActive })),
      REPORT: reports.map((r) => ({
        id: r.id,
        title: r.title,
        hint: r.year ? String(r.year) : "",
        live: r.isPublished,
      })),
      BOOKLET: booklets.map((r) => ({
        id: r.id,
        title: r.title,
        hint: r.author ?? "",
        live: r.isPublished,
      })),
    });
  } catch (error) {
    console.error("Error fetching super category content options:", error);
    return NextResponse.json({ error: "Failed to fetch content options" }, { status: 500 });
  }
}
