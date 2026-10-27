export type VideoProvider = "youtube" | "vimeo" | "facebook" | "direct" | "external" | "invalid";

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
    return !url.username && !url.password && !url.port && ["https:", "http:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Extract only the source; pasted markup is never stored or rendered as HTML. */
export function extractVideoInput(input: string): string {
  const value = input.trim();
  if (!value.startsWith("<")) return value;
  if (value.length > 10000 || !/^<iframe\b[^>]*>\s*<\/iframe>$/i.test(value)) return "";
  const tag = value.match(/^<iframe\b([^>]*)>/i)?.[1] || "";
  const sources = [...tag.matchAll(/\bsrc\s*=\s*(["'])(.*?)\1/gi)];
  if (sources.length !== 1 || /\bsrcdoc\s*=/i.test(tag)) return "";
  const source = sources[0][2].replace(/&amp;/gi, "&").replace(/&#(?:0*38|x0*26);/gi, "&");
  const url = safeHttpUrl(source);
  if (!url || url.protocol !== "https:") return "";
  return ["www.facebook.com", "facebook.com", "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"].includes(url.hostname.toLowerCase()) ? source : "";
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
  return candidate !== "videoseries" && YOUTUBE_ID.test(candidate) ? candidate : null;
}

export function describeVideoSource(input: {
  youtubeId?: string | null;
  url?: string | null;
  startSeconds?: number | null;
}): VideoPresentation {
  const raw = extractVideoInput(String(input.url || input.youtubeId || ""));
  const maybeBareId = !raw.includes("://") && YOUTUBE_ID.test(raw) ? raw : null;
  const parsed = raw ? safeHttpUrl(raw) : null;
  const youtubeId = maybeBareId ?? (parsed ? youtubeIdFrom(parsed) : null);
  const explicitStart = Number.isFinite(input.startSeconds) && Number(input.startSeconds) > 0 ? Math.floor(Number(input.startSeconds)) : null;
  const time = parsed?.searchParams.get("start") || parsed?.searchParams.get("t") || parsed?.hash.match(/^#t=(.+)$/)?.[1] || "";
  const parts = /^(\d+)h(?:(\d+)m)?(?:(\d+)s)?$|^(?:(\d+)m)?(\d+)s$/.exec(time);
  const parsedStart = /^\d+$/.test(time) ? Number(time)
    : parts ? Number(parts[1] || 0) * 3600 + Number(parts[2] || parts[4] || 0) * 60 + Number(parts[3] || parts[5] || 0) : 0;
  const start = explicitStart || (Number.isSafeInteger(parsedStart) && parsedStart > 0 ? parsedStart : null);

  const playlist = parsed?.searchParams.get("list") || "";
  if (parsed && ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(parsed.hostname.toLowerCase().replace(/^www\./, "")) &&
    ["/playlist", "/embed/videoseries"].includes(parsed.pathname) && /^[A-Za-z0-9_-]{2,200}$/.test(playlist)) {
    const query = new URLSearchParams({ list: playlist });
    if (start) query.set("start", String(start));
    return { provider: "youtube", providerLabel: "YouTube", sourceUrl: parsed.toString(),
      watchUrl: "https://www.youtube.com/playlist?list=" + playlist,
      embedUrl: "https://www.youtube-nocookie.com/embed/videoseries?" + query.toString(),
      directVideo: false, youtubeId: null };
  }

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
  if (["facebook.com", "m.facebook.com"].includes(host) && parsed.protocol === "https:") {
    const source = parsed.pathname === "/plugins/video.php" ? safeHttpUrl(parsed.searchParams.get("href") || "") : parsed;
    const sourceHost = source?.hostname.toLowerCase().replace(/^www\./, "");
    if (source && source.protocol === "https:" && ["facebook.com", "m.facebook.com"].includes(sourceHost || "") &&
      (/\/(?:videos|reel)\/[A-Za-z0-9._-]+/.test(source.pathname) || /^\/share\/v\/[A-Za-z0-9_-]+\/?$/.test(source.pathname) || (source.pathname === "/watch/" && /^\d+$/.test(source.searchParams.get("v") || "")) || (source.pathname === "/video.php" && /^\d+$/.test(source.searchParams.get("v") || "")))) {
      const embed = new URL("https://www.facebook.com/plugins/video.php");
      embed.searchParams.set("href", source.toString());
      embed.searchParams.set("show_text", "false");
      return { provider: "facebook", providerLabel: "Facebook", sourceUrl: source.toString(), watchUrl: source.toString(), embedUrl: embed.toString(), directVideo: false, youtubeId: null };
    }
    return { provider: "invalid", providerLabel: "Facebook", sourceUrl: raw, watchUrl: null, embedUrl: null, directVideo: false, youtubeId: null };
  }
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
