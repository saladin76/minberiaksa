"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { youtubeEmbed, youtubeThumb, youtubeWatch } from "@/lib/minbar/content/media";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import { NoProjects } from "@/components/minbar/states/ContentStates";
import type { SuperCategoryBlockContent, SuperCategoryContent } from "@/lib/minbar/super-category";

/**
 * A super category's landing page, rendered from the database.
 *
 * This is the page ʿIbādan Lanā used to have hand-written in JSX with its copy
 * in the i18n bundle (`components/minbar/projects/IbadanPage.tsx`, removed).
 * Everything it showed is now editable: the hero photograph, the wordmark, the
 * accent colour, the verse, the calls to action, and an ordered list of
 * sections that can hold campaigns, articles, videos, playlists, courses,
 * reports, booklets, a free text panel or a single film.
 *
 * Nothing here reads the translation tables: `lib/minbar/super-category.ts`
 * resolves every string for the visitor's locale on the server, so this file
 * only lays content out. The `ib-*` and `prg-*` class names are kept because
 * the phone rules for this layout already live under them in
 * `styles/minbar/minbar.css`.
 */

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const NARROW = { maxWidth: 900, margin: "0 auto", padding: "0 24px" } as const;

export default function SuperCategoryPage({ page }: { page: SuperCategoryContent }) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const arrow = rtl ? "←" : "→";
  const video = useVideoModal();

  return (
    <div className="ib-page">
      <Hero page={page} rtl={rtl} arrow={arrow} />

      {page.blocks.map((block) => (
        <Block key={block.key} block={block} page={page} arrow={arrow} onPlay={video.open} />
      ))}

      <VideoModal embed={video.embed} onClose={video.close} />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero({ page, rtl, arrow }: { page: SuperCategoryContent; rtl: boolean; arrow: string }) {
  return (
    <section style={{ position: "relative", background: page.accentColor, overflow: "hidden" }}>
      {page.heroImage ? (
        /* eslint-disable-next-line @next/next/no-img-element -- fills the section; not a fixed-size image */
        <img
          src={page.heroImage}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 32%" }}
        />
      ) : null}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(16,33,43,.32) 0%, rgba(16,33,43,.1) 38%, transparent 62%)`,
          pointerEvents: "none",
        }}
      />

      {page.logoImage ? (
        <a
          href={page.ctas[0]?.href || "#"}
          className="ib-logo"
          style={{ position: "absolute", insetInlineEnd: 24, top: 22, zIndex: 2, display: "grid", placeItems: "center", width: "min(40vw, 216px)", padding: "5px 8px", background: "rgba(255,255,255,.95)", borderRadius: 12, boxShadow: "0 14px 34px rgba(16,33,43,.3)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fluid wordmark, sized by its container */}
          <img src={page.logoImage} alt={page.title} style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }} />
        </a>
      ) : null}

      <div
        className="ib-hero"
        style={{ ...SECTION, position: "relative", padding: "140px 24px 110px", display: "grid", gridTemplateColumns: page.heroVideoId ? "minmax(0,1.1fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 44, alignItems: "center" }}
      >
        <div style={{ display: "inline-grid", gap: 18, justifyItems: "start", justifySelf: "start", width: "fit-content", padding: "30px 34px", background: "rgba(16,33,43,.55)", borderRadius: 14, backdropFilter: "blur(2px)", boxSizing: "border-box" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{page.title}</h1>

          {page.subtitle ? (
            <p style={{ margin: 0, maxWidth: "48ch", fontSize: "clamp(16px,1.6vw,20px)", lineHeight: 1.6, fontWeight: 800, color: "#FFE8B0" }}>{page.subtitle}</p>
          ) : null}

          {page.verseArabic ? (
            <p
              dir="rtl"
              style={{ margin: 0, maxWidth: "48ch", fontFamily: "var(--font-amiri), Almarai, Cairo, sans-serif", fontSize: "clamp(17px,1.9vw,23px)", lineHeight: 1.95, fontWeight: 700, color: "#FFE8B0", unicodeBidi: "isolate" }}
            >
              {page.verseArabic}
            </p>
          ) : null}

          {page.verseTranslation ? (
            <p style={{ margin: 0, maxWidth: "48ch", fontSize: 14.5, lineHeight: 1.85, color: "rgba(255,255,255,.85)", textWrap: "pretty" }}>
              {page.verseTranslation}
            </p>
          ) : null}

          {page.verseAttribution ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>
              <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(255,232,176,.45)" }} />
              {page.verseAttribution}
              <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(255,232,176,.45)" }} />
            </span>
          ) : null}

          {page.intro ? (
            <p style={{ margin: 0, maxWidth: "48ch", fontSize: 16.5, lineHeight: 1.95, color: "rgba(255,255,255,.9)" }}>{page.intro}</p>
          ) : null}

          {page.ctas.length ? (
            <div className="ib-ctas" style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "100%" }}>
              {page.ctas.map((cta, i) => (
                <a
                  key={cta.href + cta.label}
                  href={cta.href}
                  className={i === 0 ? undefined : "ib-ghost"}
                  style={
                    i === 0
                      ? { display: "inline-flex", alignItems: "center", gap: 6, height: 48, padding: "0 14px", borderRadius: 10, background: "#fff", border: "1px solid #fff", color: page.accentColor, fontWeight: 900, fontSize: 12.5, whiteSpace: "nowrap" }
                      : { display: "inline-flex", alignItems: "center", gap: 6, height: 48, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap" }
                  }
                >
                  {cta.label}
                  {i === 0 ? <span aria-hidden="true">{arrow}</span> : null}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {page.heroVideoId ? (
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#10212B", boxShadow: "0 24px 60px rgba(2,34,34,.45)", border: "1px solid rgba(255,255,255,.22)" }}>
            <iframe
              src={youtubeEmbed(page.heroVideoId)}
              title={page.title}
              loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ── Blocks ───────────────────────────────────────────────────────────────── */

function BlockHeading({ block }: { block: SuperCategoryBlockContent }) {
  if (!block.title && !block.eyebrow && !block.subtitle) return null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {block.eyebrow ? (
        <span style={{ fontSize: 12, fontWeight: 900, color: "#8A5D16", letterSpacing: ".04em" }}>{block.eyebrow}</span>
      ) : null}
      {block.title ? (
        <h2 style={{ margin: 0, fontSize: "clamp(22px,2.3vw,31px)", lineHeight: 1.3, fontWeight: 900, letterSpacing: "-.01em" }}>{block.title}</h2>
      ) : null}
      {block.subtitle ? (
        <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.7 }}>{block.subtitle}</span>
      ) : null}
    </div>
  );
}

function Block({
  block,
  page,
  arrow,
  onPlay,
}: {
  block: SuperCategoryBlockContent;
  page: SuperCategoryContent;
  arrow: string;
  onPlay: (embed: string) => void;
}) {
  const locale = useLocale();
  const tHome = useTranslations("homepage");
  const anchor = block.anchor || undefined;
  const wrap = (children: React.ReactNode, narrow = false) => (
    <section id={anchor} style={{ position: "relative", zIndex: 1, padding: "44px 0 8px" }}>
      <div style={narrow ? NARROW : SECTION}>{children}</div>
    </section>
  );

  switch (block.kind) {
    /* A free panel: the press mentions the programme page carried, and anything
       else an editor needs to say in its own words. */
    case "TEXT":
      return (
        <section id={anchor} style={{ position: "relative", zIndex: 1, padding: "16px 0 0" }}>
          <div
            style={{ maxWidth: 900, margin: "0 auto", padding: "26px 28px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)", borderRadius: 4, display: "grid", gap: 10 }}
          >
            {block.eyebrow ? (
              <span style={{ fontSize: 12, fontWeight: 900, color: "#8A5D16", letterSpacing: ".04em" }}>{block.eyebrow}</span>
            ) : null}
            {block.title ? (
              <h3 style={{ margin: 0, fontSize: "clamp(19px,2vw,24px)", lineHeight: 1.4, fontWeight: 900 }}>{block.title}</h3>
            ) : null}
            {block.body ? (
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.9, color: "var(--muted)", whiteSpace: "pre-line" }}>{block.body}</p>
            ) : null}
            {block.linkUrl && block.linkLabel ? (
              <a
                href={block.linkUrl}
                target={block.linkUrl.startsWith("http") ? "_blank" : undefined}
                rel={block.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                style={{ width: "fit-content", fontSize: 13.5, fontWeight: 900, color: "#A93428" }}
              >
                {block.linkLabel} <span aria-hidden="true">{arrow}</span>
              </a>
            ) : null}
          </div>
        </section>
      );

    /* One film, full width of the reading column. */
    case "VIDEO":
      if (!block.youtubeId) return null;
      return (
        <section id={anchor} style={{ position: "relative", zIndex: 1, padding: "34px 0 0" }}>
          <div style={NARROW}>
            {block.title ? (
              <h2 style={{ margin: "0 0 14px", fontSize: "clamp(20px,2.1vw,27px)", fontWeight: 900 }}>{block.title}</h2>
            ) : null}
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", boxShadow: "0 18px 44px rgba(16,33,43,.16)" }}>
              <iframe
                src={youtubeEmbed(block.youtubeId)}
                title={block.title || page.title}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </section>
      );

    case "CAMPAIGNS":
      return (
        <section id={anchor} style={{ position: "relative", zIndex: 1, padding: "44px 0 12px" }}>
          <div style={{ ...SECTION, display: "grid", gap: 18 }}>
            <BlockHeading block={block} />
            {block.campaigns.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 22, justifyContent: "center" }}>
                {block.campaigns.map((project) => (
                  <ProjectDonateCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <NoProjects />
            )}
          </div>
        </section>
      );

    /* The episodes of one playlist, with the "watch the whole series" link. */
    case "PLAYLIST_EPISODES": {
      const series = block.playlist;
      if (!series || !series.episodes.length) return null;
      const listId = series.youtubePlaylistUrl.match(/list=([\w-]+)/)?.[1] ?? null;
      return (
        <section id={anchor} style={{ position: "relative", zIndex: 1, padding: "0 0 56px", borderTop: "1px solid var(--border)" }}>
          <div style={{ ...SECTION, padding: "48px 24px 0", display: "grid", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 3 }}>
                <b style={{ fontSize: "clamp(19px,2vw,25px)", fontWeight: 900 }}>{block.title || series.title}</b>
                {block.subtitle || series.description ? (
                  <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{block.subtitle || series.description}</span>
                ) : null}
              </div>
              {series.youtubePlaylistUrl ? (
                <a
                  href={series.youtubePlaylistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prg-all"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 8, background: "var(--sand)", border: "1px solid rgba(211,154,39,.5)", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", color: "var(--deep)" }}
                  onClick={(event) => {
                    if (!listId || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onPlay(`https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1`);
                  }}
                >
                  {block.linkLabel || tHome("watchFullSeries")}
                  <span aria-hidden="true">{arrow}</span>
                </a>
              ) : null}
            </div>

            <div className="prg-eps" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {series.episodes.map((episode) => (
                <a
                  key={episode.youtubeId}
                  href={episode.url || youtubeWatch(episode.youtubeId)}
                  className="prg-ep"
                  aria-label={episode.title || series.title}
                  style={{ display: "grid", gap: 8, overflow: "hidden", borderRadius: 8, color: "inherit", textDecoration: "none" }}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onPlay(youtubeEmbed(episode.youtubeId, { autoplay: true }));
                  }}
                >
                  <span style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 8, overflow: "hidden", background: "var(--navy)" }}>
                    <span
                      aria-hidden="true"
                      className="prg-thumb"
                      style={{ position: "absolute", inset: 0, backgroundImage: `url('${episode.thumbnail || youtubeThumb(episode.youtubeId)}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                    />
                    <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                      <span className="prg-play" style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(16,33,43,.55)", display: "grid", placeItems: "center", border: "1.5px solid rgba(255,255,255,.6)" }}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    </span>
                  </span>
                  {/* The dashboard's title when typed, else YouTube's own. */}
                  {episode.title ? (
                    <b className="prg-ep-title" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 14, lineHeight: 1.55, fontWeight: 800 }}>
                      {episode.title}
                    </b>
                  ) : null}
                </a>
              ))}
            </div>
          </div>
        </section>
      );
    }

    case "POSTS":
      if (!block.posts.length) return null;
      return wrap(
        <div style={{ display: "grid", gap: 18 }}>
          <BlockHeading block={block} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
            {block.posts.map((post) => (
              <Link
                key={post.id}
                href={miaPath("article", locale, post.slug)}
                style={{ display: "grid", gridTemplateRows: "auto 1fr", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(16,33,43,.06)" }}
              >
                <span style={{ display: "block", aspectRatio: "16/9", background: `var(--sand) url('${post.cover ?? ""}') center/cover` }} />
                <span style={{ display: "grid", gap: 6, padding: "14px 16px 16px" }}>
                  <b style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 900 }}>{post.title}</b>
                  {post.excerpt ? (
                    <span style={{ fontSize: 13, lineHeight: 1.75, color: "var(--muted)" }}>{post.excerpt}</span>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        </div>
      );

    case "VIDEOS":
      if (!block.videos.length) return null;
      return wrap(
        <div style={{ display: "grid", gap: 18 }}>
          <BlockHeading block={block} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {block.videos.map((v) => (
              <button
                key={v.id}
                type="button"
                className="prg-ep"
                onClick={() => onPlay(youtubeEmbed(v.youtubeId, { autoplay: true, start: v.startSeconds ?? undefined }))}
                style={{ display: "grid", gap: 8, padding: 0, border: 0, background: "none", cursor: "pointer", font: "inherit", textAlign: "start" }}
              >
                <span style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "var(--navy)" }}>
                  <span
                    aria-hidden="true"
                    className="prg-thumb"
                    style={{ position: "absolute", inset: 0, backgroundImage: `url('${v.thumbnail || youtubeThumb(v.youtubeId)}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                    <span className="prg-play" style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(16,33,43,.55)", display: "grid", placeItems: "center", border: "1.5px solid rgba(255,255,255,.6)" }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                </span>
                <b style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 800 }}>{v.title}</b>
              </button>
            ))}
          </div>
        </div>
      );

    case "PLAYLISTS":
      if (!block.playlists.length) return null;
      return wrap(
        <div style={{ display: "grid", gap: 18 }}>
          <BlockHeading block={block} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {block.playlists.map((p) => (
              <Link key={p.id} href={miaPath("programs", locale)} style={{ display: "grid", gap: 8 }}>
                <span style={{ display: "block", aspectRatio: "16/9", borderRadius: 10, background: `var(--navy) url('${p.coverImage || (p.episodes[0] ? youtubeThumb(p.episodes[0].youtubeId) : "")}') center/cover` }} />
                <b style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 800 }}>{p.title}</b>
              </Link>
            ))}
          </div>
        </div>
      );

    case "COURSES":
      if (!block.courses.length) return null;
      return wrap(
        <div style={{ display: "grid", gap: 18 }}>
          <BlockHeading block={block} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
            {block.courses.map((c) => (
              <Link
                key={c.id}
                href={c.isExternal && c.externalUrl ? c.externalUrl : miaPath("courses", locale)}
                style={{ display: "grid", gap: 8 }}
              >
                <span style={{ display: "block", aspectRatio: "16/9", borderRadius: 10, background: `var(--navy) url('${c.coverImage}') center/cover` }} />
                <b style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 800 }}>{c.title}</b>
              </Link>
            ))}
          </div>
        </div>
      );

    case "REPORTS":
    case "BOOKLETS": {
      const documents = block.kind === "REPORTS" ? block.reports : block.booklets;
      if (!documents.length) return null;
      return wrap(
        <div style={{ display: "grid", gap: 18 }}>
          <BlockHeading block={block} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {documents.map((d) => (
              <a
                key={d.id}
                href={d.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "grid", gap: 10, padding: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(16,33,43,.06)" }}
              >
                <span style={{ display: "block", aspectRatio: "3/4", borderRadius: 8, background: `var(--sand) url('${d.coverImage}') center/cover` }} />
                <b style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 800 }}>{d.title}</b>
                {d.author || d.year ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{d.author || d.year}</span>
                ) : null}
              </a>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
