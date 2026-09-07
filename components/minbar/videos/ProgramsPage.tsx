"use client";

import { useTranslations } from "next-intl";
import { PROGRAMS } from "@/lib/minbar/content/catalog";
import { youtubeEmbed, youtubeThumb, youtubeWatch } from "@/lib/minbar/content/media";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";

/**
 * Our video programmes — ported from `Minbar/برامجنا المصورة.dc.html`.
 *
 * One band per series: its name, what it is, a link to the whole playlist, and
 * the three most recent episodes as thumbnails. Publishing an episode at the
 * head of a series in `lib/minbar/content/catalog.ts` updates both this page
 * and the homepage rail, which is the single source the handoff specifies.
 *
 * Playlists and episodes both open in the overlay player rather than sending
 * the visitor to YouTube — but every card is still a real anchor to the real
 * video, so a middle-click, a copied link and a crawler all get somewhere.
 */

/** Playlist id out of a YouTube playlist URL, for the in-site player. */
function playlistId(href: string): string | null {
  return href.match(/list=([\w-]+)/)?.[1] ?? null;
}

export default function ProgramsPage() {
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");
  const { embed, open, close } = useVideoModal();

  return (
    <div className="prg-page">
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        <div aria-hidden="true" className="vg-pattern" />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "70px 24px", display: "grid", gap: 14, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px,3.4vw,46px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {tCommon("programsTitle")}
          </h1>
          <p style={{ margin: 0, maxWidth: "60ch", fontSize: 16, lineHeight: 1.9, color: "rgba(255,255,255,.85)" }}>
            {tCommon("programsLead")}
          </p>
        </div>
      </section>

      {PROGRAMS.map((series) => {
        const list = playlistId(series.href);
        return (
          <section key={series.titleKey} className="prg-band" style={{ position: "relative", zIndex: 1, padding: "48px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <b style={{ fontSize: "clamp(19px,2vw,25px)", fontWeight: 900 }}>{t(series.titleKey)}</b>
                  <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{t(`${series.titleKey}Sub`)}</span>
                </div>
                <a
                  href={series.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prg-all"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 8, background: "var(--sand)", border: "1px solid rgba(211,154,39,.5)", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", color: "var(--deep)" }}
                  onClick={(event) => {
                    if (!list || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    open(`https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`);
                  }}
                >
                  {t("watchFullSeries")}
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="prg-arrow">
                    <path d="M10 6l6 6-6 6" />
                  </svg>
                </a>
              </div>

              <div className="prg-eps" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
                {series.episodes.map((episode) => (
                  <a
                    key={episode.id}
                    href={youtubeWatch(episode.id)}
                    className="prg-ep"
                    aria-label={t(series.titleKey)}
                    style={{ display: "block", overflow: "hidden", borderRadius: 8 }}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      open(youtubeEmbed(episode.id, { autoplay: true }));
                    }}
                  >
                    <span style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: "var(--navy)" }}>
                      <span
                        aria-hidden="true"
                        className="prg-thumb"
                        style={{ position: "absolute", inset: 0, backgroundImage: `url('${youtubeThumb(episode.id)}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                      />
                      <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                        <span className="prg-play" style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(16,33,43,.55)", display: "grid", placeItems: "center", border: "1.5px solid rgba(255,255,255,.6)" }}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      <VideoModal embed={embed} onClose={close} />
    </div>
  );
}
