import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "../../auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";

/**
 * GET /api/playlists/admin — the dashboard listing.
 *
 * Returns inactive rows too, so it sits behind the dashboard permission.
 * Episodes come back as a count: the list only needs to say how many, and the
 * edit page loads the full set.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAdminOrDashboardPermission(session, "siteContent");
    if (denied) return denied;

    const rows = await prisma.videoPlaylist.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
        coverImage: true,
        youtubePlaylistUrl: true,
        order: true,
        isActive: true,
        _count: { select: { translations: true, videos: true } },
      },
    });

    const items = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      kind: p.kind,
      coverImage: p.coverImage ?? "",
      youtubePlaylistUrl: p.youtubePlaylistUrl ?? "",
      order: p.order,
      isActive: p.isActive,
      translationCount: p._count.translations,
      videoCount: p._count.videos,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json({ error: "Failed to fetch playlists" }, { status: 500 });
  }
}
