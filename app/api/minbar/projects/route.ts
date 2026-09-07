import { NextRequest, NextResponse } from "next/server";
import { listProjectsByRegion } from "@/lib/minbar/projects";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";

/**
 * Public project list for the Minbar design's client widgets — the quick
 * donation FAB's project picker and the projects page filters.
 *
 * The design's picker groups projects by region, so this returns them grouped
 * rather than making the client regroup a flat list on every open.
 *
 * Read-only and published-only (`listProjectsByRegion` filters on `isActive`
 * and excludes soft-deleted rows), so there is nothing here a visitor should
 * not see. Amounts are display state: `DEVELOPER_HANDOFF` requires the server to
 * re-resolve and recompute everything at order creation regardless.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("locale") ?? DEFAULT_LOCALE;
  const locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE;

  try {
    const groups = await listProjectsByRegion(locale);
    return NextResponse.json(
      { groups },
      {
        headers: {
          // Project copy and totals change on donation, not per request. A short
          // shared cache with a longer stale window keeps the picker instant
          // without showing a figure that is meaningfully out of date.
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("[minbar] failed to list projects", error);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
