"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import Rail from "@/components/minbar/Rail";
import { miaPath } from "@/lib/minbar/routes";
import { IMG, type ImageKey, youtubeEmbed, youtubeThumb } from "@/lib/minbar/content/media";
import {
  ACHIEVEMENT_VIDEOS,
  CONFERENCE_2_EMBED,
  CONFERENCE_3_EMBED,
  COURSES_FOR_HOME,
  ENDORSEMENT_VIDEOS,
  PROGRAMS,
  khatibEmbed,
  videosForHome,
  type MinbarVideo,
} from "@/lib/minbar/content/catalog";
import { ArrowGlyph } from "./TopSections";

/**
 * Homepage media sections — events, the endorsement and achievement reels, the
 * programmes rail and the courses rail. Ported from
 * `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * Region and category tags are interface copy translated ×19. Video titles are
 * either a translated key (interface copy) or a proper name kept as written.
 */

/* ── Events ─────────────────────────────────────────────────────────────────
 * Three embedded recordings of the foundation's conferences. The Turkish
 * edition plays the Turkish recording of the preacher's address. */
export function EventsSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");

  const cards = [
    { src: khatibEmbed(locale), title: t("eventKhatibTitle") },
    { src: CONFERENCE_3_EMBED, title: t("eventConf3Title") },
    { src: CONFERENCE_2_EMBED, title: t("eventConf2Title") },
  ];

  return (
    <section id="events" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "56px 0", borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 22 }}>
        <div id="events-row" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(22px,2.2vw,30px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>
            {t("ourActivities")}
          </h2>
        </div>
        <div id="events-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, alignItems: "stretch" }}>
          {cards.map((card) => (
            <div
              key={card.src}
              className="mia-lift"
              style={{ display: "grid", gridTemplateRows: "auto 1fr", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 14px 40px rgba(16,33,43,.08)" }}
            >
              <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "var(--navy)" }}>
                <iframe
                  src={card.src}
                  title={card.title}
                  loading="lazy"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <div style={{ display: "grid", padding: "16px 20px 18px" }}>
                <b style={{ fontSize: "clamp(15.5px,1.5vw,18px)", fontWeight: 900, lineHeight: 1.6 }}>{card.title}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Reels ──────────────────────────────────────────────────────────────────
 * Endorsements and achievements share one card. An item with a real video opens
 * it in the in-site player; an item with only a still renders without a play
 * affordance, because a dead play button is worse than none
 * (COMPONENT_INVENTORY: "placeholder — بلا زر وهمي"). */
function ReelRail({
  id,
  title,
  viewAllLabel,
  viewAllHref,
  videos,
  showMeta,
  watchLabel,
  onPlay,
}: {
  id: string;
  title: string;
  viewAllLabel: string;
  viewAllHref: string;
  videos: MinbarVideo[];
  showMeta: boolean;
  watchLabel: string;
  onPlay: (embed: string) => void;
}) {
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");

  return (
    <Rail
      id={id}
      step={472}
      prevLabel={tCommon("prev")}
      nextLabel={tCommon("next")}
      heading={<h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{title}</h2>}
      action={
        <Link href={viewAllHref} className="mia-pill-link" style={viewAllStyle}>
          {viewAllLabel}
          <ArrowGlyph size={14} />
        </Link>
      }
    >
      {videos.map((video) => {
        const label = video.titleKey ? t(video.titleKey) : video.title;
        const image = video.youtubeId
          ? youtubeThumb(video.youtubeId)
          : video.imageKey
            ? IMG[video.imageKey as ImageKey]
            : null;
        const playable = Boolean(video.youtubeId);

        const content = (
          <>
            {image ? (
              <span
                role="img"
                aria-label={label}
                style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${image}')`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ) : null}
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.94) 8%, rgba(16,33,43,.55) 44%, rgba(16,33,43,.05) 74%)" }} />
            {playable ? (
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <span style={{ display: "grid", placeItems: "center", width: 52, height: 52, borderRadius: "50%", background: "rgba(255,253,248,.94)", color: "var(--red)", boxShadow: "0 8px 22px rgba(0,0,0,.28)" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                  </svg>
                </span>
              </span>
            ) : null}
            <span style={{ position: "absolute", insetInline: 14, bottom: 14, display: "grid", gap: 8 }}>
              <b style={{ color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1.45 }}>{label}</b>
              <span style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.74)", fontSize: 11.5, fontWeight: 700 }}>
                {showMeta ? t(video.regionKey) : null}
                {playable ? (
                  <span style={{ marginInlineStart: "auto", color: "var(--gold)", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {watchLabel}
                    <ArrowGlyph size={12} />
                  </span>
                ) : null}
              </span>
            </span>
          </>
        );

        const cardStyle: React.CSSProperties = {
          flex: "0 0 232px",
          position: "relative",
          display: "block",
          aspectRatio: "9 / 16",
          borderRadius: 18,
          overflow: "hidden",
          background: "var(--deep)",
          border: "1px solid var(--border)",
          boxShadow: "0 1px 2px rgba(16,33,43,.05)",
          padding: 0,
        };

        return playable ? (
          <button
            key={label}
            type="button"
            className="mia-reel"
            onClick={() => onPlay(youtubeEmbed(video.youtubeId as string, { autoplay: true, start: video.start }))}
            style={{ ...cardStyle, cursor: "pointer", textAlign: "start" }}
          >
            {content}
          </button>
        ) : (
          <div key={label} className="mia-reel" style={cardStyle}>
            {content}
          </div>
        );
      })}
    </Rail>
  );
}

export function ReelsSection({ onPlay }: { onPlay: (embed: string) => void }) {
  const locale = useLocale();
  const t = useTranslations("homepage");

  return (
    <section style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.14), rgba(247,242,234,.42))", borderTop: "1px solid var(--border)", padding: "56px 0", overflow: "hidden" }}>
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 46 }}>
        <ReelRail
          id="reels-a"
          title={t("ourTestimonials")}
          viewAllLabel={t("endViewAll")}
          viewAllHref={miaPath("endorsementVideos", locale)}
          videos={videosForHome(ENDORSEMENT_VIDEOS, locale)}
          showMeta
          watchLabel={t("watch")}
          onPlay={onPlay}
        />
        <ReelRail
          id="reels-b"
          title={t("ourAchievements")}
          viewAllLabel={t("achViewAll")}
          viewAllHref={miaPath("achievementVideos", locale)}
          videos={videosForHome(ACHIEVEMENT_VIDEOS, locale)}
          showMeta={false}
          watchLabel={t("watchImplementation")}
          onPlay={onPlay}
        />
      </div>
    </section>
  );
}

/* ── Programmes ─────────────────────────────────────────────────────────────
 * The first episode of each programme is the poster frame, so publishing a new
 * episode at the head of a programme updates the homepage with no other edit. */
export function ProgramsRail() {
  const locale = useLocale();
  const t = useTranslations("homepage");

  return (
    <section id="programs" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "0 0 56px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(22px,2.2vw,30px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("programsTitle")}</h2>
          <Link href={miaPath("programs", locale)} style={inlineLink}>
            {t("programsAll")}
            <ArrowGlyph />
          </Link>
        </div>
        <div id="programs-rail" className="mia-rail" style={railStyle}>
          {PROGRAMS.map((program) => (
            <Link
              key={program.titleKey}
              href={miaPath("programs", locale)}
              style={{ flex: "0 0 285px", scrollSnapAlign: "start", display: "grid", gap: 10, textDecoration: "none", color: "var(--deep)" }}
            >
              <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "var(--sand)", boxShadow: "0 12px 30px rgba(16,33,43,.12)" }}>
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url('${youtubeThumb(program.episodes[0]?.id ?? "")}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(16,33,43,.35), transparent 55%)" }} />
                <span aria-hidden="true" style={{ position: "absolute", insetInlineStart: 10, bottom: 10, display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,253,248,.92)", color: "var(--red)" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                  </svg>
                </span>
              </span>
              <b style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.5 }}>{t(program.titleKey)}</b>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Courses ────────────────────────────────────────────────────────────────
 * A course with an internal page links there; one hosted on YouTube opens its
 * intro film in the in-site player instead of leaving the site. */
export function CoursesRail({ onPlay }: { onPlay: (embed: string) => void }) {
  const locale = useLocale();
  const t = useTranslations("homepage");

  return (
    <section id="courses" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "0 0 56px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(22px,2.2vw,30px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("coursesTitle")}</h2>
          <Link href={miaPath("courses", locale)} style={inlineLink}>
            {t("coursesAll")}
            <ArrowGlyph />
          </Link>
        </div>
        <div id="courses-rail" className="mia-rail" style={railStyle}>
          {COURSES_FOR_HOME.map((course) => {
            const label = course.titleKey ? t(course.titleKey) : course.title;
            const inner = (
              <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "var(--navy)", boxShadow: "0 12px 30px rgba(16,33,43,.12)" }}>
                <span role="img" aria-label={label} style={{ position: "absolute", inset: 0, backgroundImage: `url('${course.cover}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(16,33,43,.55), transparent 60%)" }} />
                <b style={{ position: "absolute", insetInlineStart: 12, bottom: 10, color: "#fff", fontSize: 14.5, fontWeight: 900, textShadow: "0 1px 8px rgba(16,33,43,.6)" }}>{label}</b>
              </span>
            );
            const style: React.CSSProperties = {
              flex: "0 0 340px",
              scrollSnapAlign: "start",
              display: "grid",
              gap: 10,
              textDecoration: "none",
              color: "var(--deep)",
              padding: 0,
              border: 0,
              background: "none",
              textAlign: "start",
            };

            return course.external && course.introVideoId ? (
              <button
                key={course.slug}
                type="button"
                onClick={() => onPlay(youtubeEmbed(course.introVideoId as string, { autoplay: true }))}
                style={{ ...style, cursor: "pointer" }}
              >
                {inner}
              </button>
            ) : (
              <Link key={course.slug} href={miaPath("zenkiCourse", locale)} style={style}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const railStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  overflowX: "auto",
  paddingBottom: 6,
  scrollSnapType: "x mandatory",
  WebkitOverflowScrolling: "touch",
};

const inlineLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "var(--red)",
  fontWeight: 800,
  fontSize: 14,
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const viewAllStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 40,
  padding: "0 16px",
  borderRadius: 999,
  border: "1px solid rgba(211,154,39,.55)",
  background: "#fff",
  color: "var(--deep)",
  fontWeight: 800,
  fontSize: 13,
  whiteSpace: "nowrap",
  transition: "all .18s ease",
};
