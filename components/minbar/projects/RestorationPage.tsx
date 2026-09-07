"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { imageForSlug, galleryFor, youtubeEmbed } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { Button } from "@/components/minbar/ds";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import Rail from "@/components/minbar/Rail";
import { NoProjects } from "@/components/minbar/states/ContentStates";

/**
 * Restoring the homes of Al-Quds — ported from
 * `Minbar/مشروع ترميم منازل القدس.dc.html`.
 *
 * The programme page for the foundation's largest Al-Quds commitment: what it
 * is, why it matters, the five values it works to, the homes currently open for
 * support, and photographs of completed work.
 *
 * The handoff's grid of individual homes is marked `[DASHBOARD-INTEGRATION]`
 * with a comment saying its names and totals are illustrative and stand in
 * "until the official figures arrive". So they are not carried over: the grid
 * reads the live catalogue instead, and where nothing is published it says so
 * rather than showing invented houses with invented amounts raised.
 */

/** The project's stated slug in the catalogue. */
export const RESTORATION_SLUG = "al-quds-home-restoration";

/** Project film, from the handoff's hero embed. */
const VIDEO_ID = "P_EiC5RUOpA";

/** The five values the programme works to, from the foundation's own file. */
const VALUES = ["restValue1", "restValue2", "restValue3", "restValue4", "restValue5"];

/** The three explanatory cards, each with its own drawn glyph. */
const CARDS: ReadonlyArray<{ title: string; body: string; icon: "alert" | "home" | "heart" }> = [
  { title: "restWhyTitle", body: "restWhyBody", icon: "alert" },
  { title: "restWhatTitle", body: "restWhatBody", icon: "home" },
  { title: "restImpactTitle", body: "restImpactBody", icon: "heart" },
];

const ICONS = {
  alert: (
    <>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.5 18a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  heart: <path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" />,
} as const;

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export interface RestorationPageProps {
  /** Homes and restoration campaigns open for support, from the catalogue. */
  projects: MinbarProject[];
  /**
   * Homes restored so far and the programme's target, as published by the
   * foundation. Carried from the handoff, which prints them as figures beside
   * the reviewed `restStatHomes` / `restStatGoal` labels.
   */
  restored: number;
  goal: number;
}

export default function RestorationPage({ projects, restored, goal }: RestorationPageProps) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const { formatNumber } = useMinbarMoney();

  const hero = imageForSlug(RESTORATION_SLUG, 1600);
  const gallery = galleryFor("al-quds", 8, 700);
  const pct = goal > 0 ? Math.min(Math.round((restored / goal) * 100), 100) : 0;

  return (
    <div className="rest-page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        {hero ? (
          <span
            role="img"
            aria-label={t("restHeroTitle")}
            style={{ position: "absolute", inset: 0, backgroundImage: `url('${hero}')`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(16,33,43,.35) 0%, rgba(16,33,43,.15) 38%, transparent 62%)`, pointerEvents: "none" }}
        />
        <div className="rest-hero" style={{ ...SECTION, position: "relative", padding: "140px 24px 110px", display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)", gap: 44, alignItems: "end" }}>
          <div className="rest-in" style={{ display: "grid", gap: 18, justifyItems: "start", padding: "26px 28px", background: "rgba(16,33,43,.55)", borderRadius: 14, backdropFilter: "blur(2px)" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("restHeroTitle")}</h1>
            <p style={{ margin: 0, maxWidth: "58ch", fontSize: 16.5, lineHeight: 1.95, color: "rgba(255,255,255,.9)" }}>{t("restHeroLead")}</p>
            <a
              href="#current-projects"
              className="rest-jump"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 15.5, transition: "all .18s ease" }}
            >
              {t("currentRestorationsTitle")}
            </a>
          </div>
          <div className="rest-in rest-in-1" style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#10212B", boxShadow: "0 24px 60px rgba(2,34,34,.45)", border: "1px solid rgba(255,255,255,.22)" }}>
            <iframe
              src={youtubeEmbed(VIDEO_ID)}
              title={t("restHeroTitle")}
              loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ── Programme progress ────────────────────────────────────────────── */}
      <section style={{ position: "relative", zIndex: 1, background: "var(--navy)", padding: "26px 0" }}>
        <div className="rest-stats" style={{ ...SECTION, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 18, textAlign: "center" }}>
          <div className="rest-in" style={{ display: "grid", gap: 4 }}>
            <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 900, color: "var(--gold)" }}>{formatNumber(restored)}</b>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>{t("restStatHomes")}</span>
          </div>
          <div className="rest-in rest-in-1" style={{ display: "grid", gap: 4 }}>
            <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 900, color: "var(--gold)" }}>{formatNumber(goal)}</b>
            <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.72)" }}>{t("restStatGoal")}</span>
          </div>
        </div>
        <div style={{ maxWidth: 1240, margin: "18px auto 0", padding: "0 24px" }}>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,.14)", overflow: "hidden" }}
          >
            <span className="rest-bar" style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 999, background: "var(--gold)" }} />
          </div>
        </div>
      </section>

      {/* ── Values, and the homes open now ────────────────────────────────── */}
      <section id="current-projects" style={{ position: "relative", zIndex: 1, background: "var(--sand)", padding: "46px 0 52px", overflow: "hidden" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "grid", gap: 20 }}>
          <div className="rest-values" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 }}>
            {VALUES.map((value) => (
              <span
                key={value}
                className="rest-value"
                style={{ position: "relative", display: "grid", alignContent: "center", justifyItems: "center", minHeight: 86, padding: "14px 12px", background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 8, boxShadow: "0 1px 2px rgba(16,33,43,.05)", fontSize: 12.5, fontWeight: 800, color: "var(--deep)", textAlign: "center", lineHeight: 1.65 }}
              >
                {t(value)}
              </span>
            ))}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <b style={{ fontSize: 18 }}>{t("currentRestorationsTitle")}</b>
            <span style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.85 }}>{t("currentRestorationsLead")}</span>
          </div>

          {projects.length ? (
            <div className="rest-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {projects.map((project) => (
                <ProjectDonateCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            /* The handoff's own cards are illustrative placeholders. Rather than
               ship invented houses with invented totals, an empty catalogue says
               so and offers the way to every other project. */
            <NoProjects />
          )}
        </div>
      </section>

      {/* ── Why, what, and the impact ─────────────────────────────────────── */}
      <section style={{ position: "relative", zIndex: 1, padding: "60px 0 24px" }}>
        <div className="rest-cards" style={{ ...SECTION, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
          {CARDS.map((card) => (
            <div key={card.title} className="rest-card" style={{ display: "grid", gap: 10, padding: 24, background: "var(--sand)", borderRadius: 8, borderTop: "3px solid var(--gold)" }}>
              <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 9, background: "#fff", color: "var(--gold)" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[card.icon]}
                </svg>
              </span>
              <b style={{ fontSize: 15.5 }}>{t(card.title)}</b>
              <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.9 }}>{t(card.body)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Completed work ────────────────────────────────────────────────── */}
      <section style={{ position: "relative", zIndex: 1, padding: "0 0 56px" }}>
        <div style={{ ...SECTION, display: "grid", gap: 20 }}>
          <b style={{ fontSize: "clamp(21px,2vw,27px)", fontWeight: 900 }}>{t("restAchievements")}</b>
          <Rail step={340} prevLabel={t("restAchievements")} nextLabel={t("restAchievements")}>
            {gallery.map((photo, index) => (
              <span
                key={photo}
                style={{ flex: "0 0 320px", position: "relative", display: "block", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden", background: "var(--sand)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains */}
                <img
                  src={photo}
                  alt=""
                  loading={index < 2 ? undefined : "lazy"}
                  decoding="async"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              </span>
            ))}
          </Rail>
        </div>
      </section>

      {/* ── Give to the programme ─────────────────────────────────────────── */}
      <section id="donate" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "0 0 56px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <b style={{ fontSize: 18 }}>{t("restDonateTitle")}</b>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>{t("restDonateNote")}</span>
          </div>
          {/* Each home above carries its own amounts; this is the way to give
             to the programme rather than to one house. */}
          <Button variant="primary" size="lg" href={miaPath("projects", locale)} style={{ justifySelf: "start", whiteSpace: "nowrap" }}>
            {tCommon("donate")}
          </Button>
        </div>
      </section>
    </div>
  );
}
