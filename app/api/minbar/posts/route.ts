import { NextRequest, NextResponse } from "next/server";
import { listArticles, ARTICLES_PER_PAGE } from "@/lib/minbar/posts";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";

/**
 * Public article list for the blog's "show more" button and its category chips.
 *
 * The first page is server-rendered by the blog route itself; this serves every
 * page after it, and every switch of category, without a full navigation.
 *
 * Read-only and published-only — `listArticles` filters on `published`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = params.get("locale") ?? DEFAULT_LOCALE;
  const locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE;
  const categoryId = params.get("categoryId") || null;
  const cursor = params.get("cursor") || null;

  try {
    const { items, nextCursor } = await listArticles({
      locale,
      categoryId,
      cursor,
      take: ARTICLES_PER_PAGE,
    });

    return NextResponse.json(
      { items, nextCursor },
      {
        headers: {
          // Articles change when an editor publishes, not per request.
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("[minbar] failed to list articles", error);
    return NextResponse.json({ error: "Failed to load articles" }, { status: 500 });
  }
}
