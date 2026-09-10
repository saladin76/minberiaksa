import { listShardIds, renderIndex } from "@/lib/sitemap";

/**
 * /sitemap.xml — a sitemap INDEX, not the document itself.
 *
 * It used to be the whole thing, which grew past Vercel's 19.07 MB prerender
 * ceiling (FALLBACK_BODY_TOO_LARGE). Keeping the path as the index means
 * anything already pointing here — robots.txt, Search Console — keeps working.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const body = renderIndex(await listShardIds(), new Date());
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
