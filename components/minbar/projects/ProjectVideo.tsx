"use client";

import { useEffect, useState } from "react";

/**
 * The campaign's own video (`Campaign.videoUrl`, or the locale's
 * `CampaignTranslation.videoUrl`) on the project page.
 *
 * Admins paste share links, not embed links, so the URL is turned into the
 * provider's player: YouTube (watch / youtu.be / shorts), Vimeo, Facebook
 * (its /share/ short links are resolved server-side first, as on the legacy
 * campaign page), or a direct video file played natively. Anything else is
 * not embedded  an arbitrary page in an iframe is not a video.
 */

type Player = { kind: "iframe"; src: string } | { kind: "video"; src: string } | null;

function playerFor(raw: string): Player {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id = url.searchParams.get("v");
    if (!id && host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    if (!id) id = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{6,})/)?.[1];
    return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "facebook.com" || host === "fb.watch") {
    return { kind: "iframe", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(raw)}&show_text=false&width=720` };
  }
  if (/\.(mp4|webm|ogg|m3u8)$/i.test(url.pathname)) return { kind: "video", src: url.toString() };
  return null;
}

function isFacebookShare(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.hostname.includes("facebook.com") && url.pathname.startsWith("/share/");
  } catch {
    return false;
  }
}

export default function ProjectVideo({ url, title }: { url: string; title: string }) {
  const [player, setPlayer] = useState<Player>(() => (isFacebookShare(url) ? null : playerFor(url)));

  useEffect(() => {
    if (!isFacebookShare(url)) {
      setPlayer(playerFor(url));
      return;
    }
    let live = true;
    fetch(`/api/resolve-url?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then(({ resolved }: { resolved?: string }) => live && setPlayer(playerFor(resolved || url)))
      .catch(() => live && setPlayer(playerFor(url)));
    return () => {
      live = false;
    };
  }, [url]);

  if (!player) return null;

  return (
    <span style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "var(--deep)", border: "1px solid var(--border)" }}>
      {player.kind === "iframe" ? (
        <iframe
          src={player.src}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      ) : (
        <video src={player.src} controls preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000" }} />
      )}
    </span>
  );
}
