import { buildShard, listShardIds, renderUrlset } from "@/lib/sitemap";

/** One shard of the sitemap, e.g. /sitemap/posts-0.xml. Indexed by /sitemap.xml. */
export const revalidate = 3600;

/** Prerender every shard at build time so crawlers never wait on a cold render. */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const ids = await listShardIds();
  return ids.map((id) => ({ id: `${id}.xml` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const entries = await buildShard(id.replace(/\.xml$/, ""));
  if (!entries) return new Response("Not found", { status: 404 });

  return new Response(renderUrlset(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
