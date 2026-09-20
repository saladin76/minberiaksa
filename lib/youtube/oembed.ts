import "server-only";

/**
 * A video's title as YouTube itself publishes it.
 *
 * The dashboard lets a programme's episodes be pasted in as bare links, with
 * no title typed — so a rail of episodes had nothing to say under each frame.
 * YouTube's oEmbed endpoint returns the title for any public video without
 * an API key or a quota, so the gap is filled from there at render time.
 *
 * Cached for a day per video through `fetch`'s data cache: the site renders
 * a page far more often than a title changes. A failure (private video,
 * network) yields `null` and the frame stays untitled — a missing caption is
 * better than a broken rail.
 */

const OEMBED = "https://www.youtube.com/oembed";
const REVALIDATE_SECONDS = 24 * 60 * 60;
/** Enough for a rail; a pathological playlist won't fan out into hundreds of requests. */
const MAX_PARALLEL = 8;

export async function fetchYoutubeTitle(youtubeId: string): Promise<string | null> {
  if (!/^[\w-]{6,20}$/.test(youtubeId)) return null;
  try {
    const url = `${OEMBED}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: unknown };
    const title = typeof data.title === "string" ? data.title.trim() : "";
    return title || null;
  } catch {
    return null;
  }
}

/**
 * Give every untitled item the title YouTube has for it, in place of the
 * empty string. Items that already carry a title from the dashboard are
 * left exactly as they are: what an editor wrote wins over what YouTube says.
 */
export async function fillYoutubeTitles<T extends { youtubeId: string; title: string }>(items: T[]): Promise<T[]> {
  const missing = items.filter((item) => !item.title && item.youtubeId);
  if (!missing.length) return items;

  const ids = [...new Set(missing.map((item) => item.youtubeId))];
  const titles = new Map<string, string>();
  for (let i = 0; i < ids.length; i += MAX_PARALLEL) {
    const batch = ids.slice(i, i + MAX_PARALLEL);
    const found = await Promise.all(batch.map((id) => fetchYoutubeTitle(id)));
    batch.forEach((id, j) => { if (found[j]) titles.set(id, found[j]!); });
  }

  return items.map((item) => (!item.title && titles.has(item.youtubeId) ? { ...item, title: titles.get(item.youtubeId)! } : item));
}
