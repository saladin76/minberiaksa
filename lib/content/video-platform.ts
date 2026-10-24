export type VideoProvider = "youtube" | "vimeo" | "direct" | "external" | "invalid";

export interface VideoPresentation {
  provider: VideoProvider;
  providerLabel: string;
  sourceUrl: string;
  watchUrl: string | null;
  embedUrl: string | null;
  directVideo: boolean;
  youtubeId: string | null;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,15}$/;
const DIRECT_MEDIA = /\.(?:mp4|webm|ogg)(?:$|[?#])/i;

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function youtubeIdFrom(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate = "";
  if (host === "youtu.be") candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
  else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") candidate = url.searchParams.get("v") ?? "";
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) candidate = parts[1] ?? "";
  }
  return YOUTUBE_ID.test(candidate) ? candidate : null;
}

export function describeVideoSource(input: {
  youtubeId?: string | null;
  url?: string | null;
  startSeconds?: number | null;
}): VideoPresentation {
  const raw = String(input.url ?? input.youtubeId ?? "").trim();
  const maybeBareId = !raw.includes("://") && YOUTUBE_ID.test(raw) ? raw : null;
  const parsed = raw ? safeHttpUrl(raw) : null;
  const youtubeId = maybeBareId ?? (parsed ? youtubeIdFrom(parsed) : null);
  const start = Number.isFinite(input.startSeconds) && Number(input.startSeconds) > 0
    ? Math.floor(Number(input.startSeconds))
    : null;

  if (youtubeId) {
    const query = start ? `?start=${start}` : "";
    return {
      provider: "youtube",
      providerLabel: "YouTube",
      sourceUrl: parsed?.toString() ?? `https://www.youtube.com/watch?v=${youtubeId}`,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}${start ? `&t=${start}s` : ""}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}${query}`,
      directVideo: false,
      youtubeId,
    };
  }

  if (!parsed) {
    return { provider: "invalid", providerLabel: "غير معروف", sourceUrl: raw, watchUrl: null, embedUrl: null, directVideo: false, youtubeId: null };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const candidate = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (VIMEO_ID.test(candidate)) {
      return {
        provider: "vimeo",
        providerLabel: "Vimeo",
        sourceUrl: parsed.toString(),
        watchUrl: `https://vimeo.com/${candidate}`,
        embedUrl: `https://player.vimeo.com/video/${candidate}${start ? `#t=${start}s` : ""}`,
        directVideo: false,
        youtubeId: null,
      };
    }
  }

  if (DIRECT_MEDIA.test(`${parsed.pathname}${parsed.search}`)) {
    return { provider: "direct", providerLabel: "فيديو مباشر", sourceUrl: parsed.toString(), watchUrl: parsed.toString(), embedUrl: parsed.toString(), directVideo: true, youtubeId: null };
  }

  return { provider: "external", providerLabel: host, sourceUrl: parsed.toString(), watchUrl: parsed.toString(), embedUrl: null, directVideo: false, youtubeId: null };
}

/** Returns a safe source to persist without trusting a client-supplied embed URL. */
export function normalizeVideoSource(input: { youtubeId?: unknown; url?: unknown; mediaUrl?: unknown; startSeconds?: number | null }) {
  const candidate = String(input.mediaUrl ?? input.url ?? input.youtubeId ?? "").trim();
  const presentation = describeVideoSource({ url: candidate, startSeconds: input.startSeconds });
  if (presentation.provider === "invalid") return { youtubeId: null, url: null, presentation };
  return {
    youtubeId: presentation.youtubeId,
    url: presentation.sourceUrl,
    presentation,
  };
}
