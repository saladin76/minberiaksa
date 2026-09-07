"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { PROGRAMS } from "@/lib/minbar/content/catalog";
import { youtubeEmbed, youtubeThumb, youtubeWatch } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import type { VerseBlock } from "@/lib/minbar/quran";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import VideoModal, { useVideoModal } from "@/components/minbar/VideoModal";
import { NoProjects } from "@/components/minbar/states/ContentStates";

/**
 * The ʿIbādan Lanā project — ported from `Minbar/مشروع عبادا لنا.dc.html`.
 *
 * The programme raising a Qur'anic generation around Al-Aqsa: the verse it
 * takes its name from, the projects that make it up, the launch film, the press
 * that covered it, and the documentary series.
 *
 * The three press items link to real published articles and are carried as
 * they stand. The project grid reads the live catalogue, so a project that
 * closes stops appearing here without an edit.
 */

/** Launch film, and the introductory film that plays only in the Arabic cut. */
const LAUNCH_VIDEO = "hRaECN_ZLa4";
const INTRO_VIDEO = "0TKV80zde2I";

/** The three press items, each with the article it points at. */
const PRESS: ReadonlyArray<{ eyebrow: string; title: string; body: string; cta: string; href: string }> = [
  {
    eyebrow: "ibadanEyebrow1",
    title: "ibadanNews1Title",
    body: "ibadanNews1Body",
    cta: "ibadanReadReport",
    href: "https://raissouni.com/5410",
  },
  {
    eyebrow: "ibadanEyebrow2",
    title: "ibadanNews2Title",
    body: "ibadanNews2Body",
    cta: "ibadanReadNews",
    href: "https://www.msf-online.com/أبرزهم-الريسوني-نخبة-من-علماء-الأمة-ي/",
  },
  {
    eyebrow: "ibadanEyebrow3",
    title: "ibadanNews3Title",
    body: "ibadanNews3Body",
    cta: "ibadanReadNews",
    href: "https://raissouni.com/5410",
  },
];

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export interface IbadanPageProps {
  /** The projects making up the programme, from the live catalogue. */
  projects: MinbarProject[];
  /** Al-Isra 5 — the verse the project takes its name from. */
  verse: VerseBlock;
}

export default function IbadanPage({ projects, verse }: IbadanPageProps) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("projects");
  const tHome = useTranslations("homepage");
  const { embed, open, close } = useVideoModal();

  const series = PROGRAMS.find((program) => program.titleKey === "progIbadan");
  const playlist = series?.href.match(/list=([\w-]+)/)?.[1] ?? null;
  const arrow = rtl ? "←" : "→";

  /* The project's wordmark is Arabic calligraphy; the other language editions
     have their own Latin lockup. */
  const logo = locale === "ar" ? "/minbar/assets/ibadan-logo.jpg" : "/minbar/assets/ibadan-logo-en.png";

  /* The introductory film is an Arabic recording with no subtitled cut, so it
     is shown only in the Arabic edition rather than played at a reader who
     cannot follow it. */
  const showIntro = locale === "ar";

  return (
    <div className="ib-page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "#7C2318", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- fills the section; not a fixed-size image */}
        <img
          src="/minbar/assets/ibadan-hero.jpg"
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 32%" }}
        />
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(16,33,43,.32) 0%, rgba(16,33,43,.1) 38%, transparent 62%)`, pointerEvents: "none" }}
        />
        <a href="#bundle" className="ib-logo" style={{ position: "absolute", insetInlineEnd: 24, top: 22, zIndex: 2, display: "grid", placeItems: "center", width: "min(40vw, 216px)", padding: "5px 8px", background: "rgba(255,255,255,.95)", borderRadius: 12, boxShadow: "0 14px 34px rgba(16,33,43,.3)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fluid wordmark, sized by its container */}
          <img src={logo} alt={t("ibadanHeroTitle")} style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }} />
        </a>

        <div className="ib-hero" style={{ ...SECTION, position: "relative", padding: "140px 24px 110px", display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 44, alignItems: "center" }}>
          <div style={{ display: "inline-grid", gap: 18, justifyItems: "start", justifySelf: "start", width: "fit-content", padding: "30px 34px", background: "rgba(16,33,43,.55)", borderRadius: 14, backdropFilter: "blur(2px)", boxSizing: "border-box" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("ibadanHeroTitle")}</h1>
            <p dir="rtl" style={{ margin: 0, maxWidth: "48ch", fontFamily: "var(--font-amiri), Almarai, Cairo, sans-serif", fontSize: "clamp(17px,1.9vw,23px)", lineHeight: 1.95, fontWeight: 700, color: "#FFE8B0", unicodeBidi: "isolate" }}>
              {verse.arabic}
            </p>
            {verse.translation ? (
              <>
                <p style={{ margin: 0, maxWidth: "48ch", fontSize: 14.5, lineHeight: 1.85, color: "rgba(255,255,255,.85)", textWrap: "pretty" }}>
                  {verse.translation}
                </p>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(255,232,176,.45)" }} />
                  {verse.attribution}
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(255,232,176,.45)" }} />
                </span>
              </>
            ) : null}
            <p style={{ margin: 0, maxWidth: "48ch", fontSize: 16.5, lineHeight: 1.95, color: "rgba(255,255,255,.9)" }}>{t("ibadanHeroIntro")}</p>

            <div className="ib-ctas" style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "100%" }}>
              <a href="#bundle" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 48, padding: "0 14px", borderRadius: 10, background: "#fff", border: "1px solid #fff", color: "#7C2318", fontWeight: 900, fontSize: 12.5, whiteSpace: "nowrap" }}>
                {t("ibadanCtaDonate")}
                <span aria-hidden="true">{arrow}</span>
              </a>
              <a href="#launch-video" className="ib-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 48, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap" }}>
                {t("ibadanCtaLaunch")}
              </a>
              <a href="#series" className="ib-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 48, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap" }}>
                {t("ibadanCtaSeries")}
              </a>
            </div>
          </div>

          {showIntro ? (
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#10212B", boxShadow: "0 24px 60px rgba(2,34,34,.45)", border: "1px solid rgba(255,255,255,.22)" }}>
              <iframe
                src={youtubeEmbed(INTRO_VIDEO)}
                title={t("ibadanHeroTitle")}
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

      {/* ── The projects that make it up ──────────────────────────────────── */}
      <section id="bundle" style={{ position: "relative", zIndex: 1, padding: "62px 0 20px" }}>
        <div style={SECTION}>
          {projects.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 22, justifyContent: "center" }}>
              {projects.map((project) => (
                <ProjectDonateCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <NoProjects />
          )}
        </div>
      </section>

      {/* ── The launch film ───────────────────────────────────────────────── */}
      <section id="launch-video" style={{ position: "relative", zIndex: 1, padding: "34px 0 0" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", boxShadow: "0 18px 44px rgba(16,33,43,.16)" }}>
            <iframe
              src={youtubeEmbed(LAUNCH_VIDEO)}
              title={t("ibadanCtaLaunch")}
              loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ── The press ─────────────────────────────────────────────────────── */}
      <section id="launch-report" style={{ position: "relative", zIndex: 1, padding: "34px 0 56px" }}>
        {PRESS.map((item, index) => (
          <div
            key={item.title}
            style={{ maxWidth: 900, margin: index === 0 ? "0 auto" : "16px auto 0", padding: "26px 28px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)", borderRadius: 4, display: "grid", gap: 10 }}
          >
            <span style={{ fontSize: 12, fontWeight: 900, color: "#8A5D16", letterSpacing: ".04em" }}>{t(item.eyebrow)}</span>
            <h3 style={{ margin: 0, fontSize: "clamp(19px,2vw,24px)", lineHeight: 1.4, fontWeight: 900 }}>{t(item.title)}</h3>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.9, color: "var(--muted)" }}>{t(item.body)}</p>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ width: "fit-content", fontSize: 13.5, fontWeight: 900, color: "#A93428" }}
            >
              {t(item.cta)} <span aria-hidden="true">{arrow}</span>
            </a>
          </div>
        ))}
      </section>

      {/* ── The documentary series ────────────────────────────────────────── */}
      {series ? (
        <section id="series" style={{ position: "relative", zIndex: 1, padding: "0 0 56px", borderTop: "1px solid var(--border)" }}>
          <div style={{ ...SECTION, padding: "48px 24px 0", display: "grid", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 3 }}>
                <b style={{ fontSize: "clamp(19px,2vw,25px)", fontWeight: 900 }}>{t("ibadanSeriesTitle")}</b>
                <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{t("ibadanSeriesSub")}</span>
              </div>
              <a
                href={series.href}
                target="_blank"
                rel="noopener noreferrer"
                className="prg-all"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 8, background: "var(--sand)", border: "1px solid rgba(211,154,39,.5)", fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", color: "var(--deep)" }}
                onClick={(event) => {
                  if (!playlist || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  open(`https://www.youtube.com/embed/videoseries?list=${playlist}&autoplay=1`);
                }}
              >
                {tHome("watchFullSeries")}
                <span aria-hidden="true">{arrow}</span>
              </a>
            </div>

            <div className="prg-eps" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {series.episodes.map((episode) => (
                <a
                  key={episode.id}
                  href={youtubeWatch(episode.id)}
                  className="prg-ep"
                  aria-label={t("ibadanSeriesTitle")}
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
      ) : null}

      <VideoModal embed={embed} onClose={close} />
    </div>
  );
}
