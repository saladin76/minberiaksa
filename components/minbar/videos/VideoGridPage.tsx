"use client";

import { useLocale, useTranslations } from "next-intl";
import { IMG, youtubeEmbed, youtubeThumb, youtubeWatch, type ImageKey } from "@/lib/minbar/content/media";
import type { MinbarVideo } from "@/lib/minbar/content/catalog";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";

/**
 * The two video index pages — ported from `Minbar/إنجازاتنا بالفيديو.dc.html`
 * and `Minbar/تزكياتنا بالفيديو.dc.html`, which are the same page over two
 * different sets.
 *
 * A card with a real recording is an anchor to YouTube that opens the overlay
 * player instead, so a middle-click or a copied link still works and nobody is
 * sent off the site mid-journey. A card that is only a still — a piece the
 * foundation has photographed but not yet filmed — is not a link and carries no
 * play affordance: offering one that plays nothing is worse than offering none.
 */

export interface VideoGridPageProps {
  /** Ordered set from `lib/minbar/content/catalog.ts`. */
  videos: readonly MinbarVideo[];
  /** Keys in the `homepage` namespace for the page's own title and lead. */
  titleKey: string;
  leadKey: string;
}

export default function VideoGridPage({ videos, titleKey, leadKey }: VideoGridPageProps) {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const { embed, open, close } = useVideoModal();

  /* A video restricted to particular language editions is only listed in them —
     the Turkish endorsements are recorded for a Turkish audience. */
  const shown = videos.filter((video) => video.published && (!video.locales || video.locales.includes(locale)));

  return (
    <div className="vg-page">
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        <div aria-hidden="true" className="vg-pattern" />
        <span aria-hidden="true" className="vg-rule" />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "52px 24px 46px", display: "grid", gap: 12, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(26px,3vw,42px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>{t(titleKey)}</h1>
          <p style={{ margin: 0, maxWidth: "62ch", fontSize: 15, lineHeight: 2, color: "rgba(255,255,255,.82)" }}>{t(leadKey)}</p>
        </div>
      </section>

      <section style={{ position: "relative", padding: "46px 0 60px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <div className="vg-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {shown.map((video) => {
              const title = video.titleKey ? t(video.titleKey) : video.title;
              const image = video.youtubeId
                ? youtubeThumb(video.youtubeId)
                : video.imageKey
                  ? IMG[video.imageKey as ImageKey]
                  : null;

              const card = (
                <>
                  <span
                    role="img"
                    aria-label={title}
                    style={{ position: "absolute", inset: 0, backgroundImage: image ? `url('${image}')` : undefined, backgroundColor: image ? undefined : "var(--navy)", backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.92) 10%, rgba(16,33,43,.4) 46%, rgba(16,33,43,.1) 80%)", pointerEvents: "none" }} />
                  <span style={{ position: "absolute", insetInlineStart: 12, top: 12, padding: "4px 11px", borderRadius: 999, background: "rgba(16,33,43,.72)", color: "#fff", fontSize: 11, fontWeight: 900 }}>
                    {t(video.regionKey)}
                  </span>
                  {video.youtubeId ? (
                    <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(16,33,43,.55)", display: "grid", placeItems: "center", border: "1.5px solid rgba(255,255,255,.6)", color: "#fff" }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  ) : null}
                  <span style={{ position: "absolute", insetInline: 14, bottom: 13, display: "grid", gap: 6 }}>
                    <b style={{ color: "#fff", fontWeight: 800, fontSize: 15, lineHeight: 1.5 }}>{title}</b>
                  </span>
                </>
              );

              const frame = {
                position: "relative" as const,
                display: "grid",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--navy)",
                aspectRatio: "16/10",
                boxShadow: "0 12px 34px rgba(16,33,43,.12)",
              };

              return video.youtubeId ? (
                <a
                  key={video.title}
                  href={youtubeWatch(video.youtubeId, video.start)}
                  className="vg-card"
                  style={{ ...frame, cursor: "pointer" }}
                  onClick={(event) => {
                    /* Modified clicks are the reader asking for a new tab, and
                       the href they land on is the real video. */
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    open(youtubeEmbed(video.youtubeId!, { autoplay: true, start: video.start }));
                  }}
                >
                  {card}
                </a>
              ) : (
                <div key={video.title} className="vg-card vg-card--still" style={frame}>
                  {card}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <VideoModal embed={embed} onClose={close} />
      <ZakatBanner />
    </div>
  );
}
