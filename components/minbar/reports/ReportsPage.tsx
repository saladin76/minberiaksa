"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { drive } from "@/lib/minbar/content/media";
import { ORG_WHATSAPP } from "@/lib/minbar/org";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import { useMinbarReveal, useMinbarCountUp } from "@/hooks/useMinbarReveal";
import { Button } from "@/components/minbar/ds";
import Rail from "@/components/minbar/Rail";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import { ProgramIcon } from "./ProgramIcons";
import { NoReports } from "@/components/minbar/states/ContentStates";
import {
  BIG_STATS,
  CLOSING_IMAGE,
  HERO_IMAGE,
  MILESTONES,
  PROGRAMS,
  QUDS_METRICS,
  REPORTS,
  REPORT_BASE,
  SCENES,
  SECTOR_STATS,
  VOICES,
} from "@/lib/minbar/achievements";

/**
 * Achievements and reports — ported from
 * `Minbar/إنجازات وتقارير المؤسسة.dc.html`.
 *
 * The site's one dark page, and its longest: a photographic hero, the
 * foundation's approved totals, three full-bleed scenes each built around a
 * single figure, testimonies from the field, the six programmes with their
 * share of resources, the response timeline, the published documents, and a
 * closing call.
 *
 * Every figure comes from `lib/minbar/achievements.ts`, which carries the
 * handoff's rule with it: these are approved published numbers, replaced only
 * by newer approved ones.
 *
 * The handoff drives its testimonies with Swiper. This uses the site's own
 * `Rail`, which already handles the RTL scroll arithmetic — one carousel
 * behaviour across the site, and one less library on a page that already loads
 * eleven photographs.
 */

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const SECTION_TITLE = {
  margin: 0,
  fontSize: "clamp(30px,3.4vw,50px)",
  lineHeight: 1.2,
  fontWeight: 900,
  color: "#fff",
  letterSpacing: "-.02em",
} as const;

/** A block that fades and lifts into place the first time it is scrolled to. */
function Rise({ children, style, className }: { children: ReactNode; style?: React.CSSProperties; className?: string }) {
  const { ref, shown } = useMinbarReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`rp-rise${shown ? " in" : ""}${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

/** A reported figure that counts up when it comes into view. */
function Figure({ value, style, dir = "ltr" }: { value: number; style: React.CSSProperties; dir?: "ltr" }) {
  const { format } = useMinbarNumber();
  const { ref, value: shown } = useMinbarCountUp(value);
  return (
    <b ref={ref as React.Ref<HTMLElement>} dir={dir} style={{ unicodeBidi: "isolate", ...style }}>
      {format(shown)}
    </b>
  );
}

/** Grouping separators for the reader's locale, applied to every figure. */
function useMinbarNumber() {
  const { formatNumber } = useMinbarMoney();
  return { format: formatNumber } as const;
}

export default function ReportsPage() {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("achievements");
  const tCommon = useTranslations("common");
  const { formatNumber } = useMinbarMoney();

  /* The scene gradients run from the edge the copy sits against, so a scene
     reads the same way round in Arabic as it does in English. */
  const sceneGradient = (side: "start" | "end") => {
    const fromStart = side === "start" ? !rtl : rtl;
    return `linear-gradient(${fromStart ? "90deg" : "-90deg"}, rgba(16,33,43,.96) 22%, rgba(16,33,43,.72) 58%, rgba(16,33,43,.35))`;
  };

  const chipStyle: React.CSSProperties = {
    justifySelf: "start",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,.07)",
    border: "1px solid rgba(211,154,39,.4)",
    color: "rgba(255,255,255,.7)",
    fontSize: 12,
    fontWeight: 800,
  };

  return (
    <div className="rp-page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="rp-hero" style={{ position: "relative", minHeight: "92vh", display: "grid", alignItems: "end", overflow: "hidden", background: "#10212B" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains */}
        <img src={drive(HERO_IMAGE, 2000)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #10212B 6%, rgba(16,33,43,.72) 46%, rgba(16,33,43,.35))", pointerEvents: "none" }} />
        <div aria-hidden="true" className="rp-pattern rp-pattern--hero" />
        <div className="rp-hero-copy" style={{ ...SECTION, position: "relative", width: "100%", padding: "0 24px 92px", display: "grid", gap: 22, justifyItems: "start" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 900, color: "var(--gold)", letterSpacing: ".16em" }}>
            {t("hero.eyebrow")}
          </span>
          {/* The title carries a `<br>` in every language's translation — it is
              the one place the report chooses where the headline breaks. */}
          <h1
            style={{ margin: 0, fontSize: "clamp(38px,6vw,90px)", lineHeight: 1.16, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}
            // eslint-disable-next-line react/no-danger -- reviewed translation copy whose only markup is a line break
            dangerouslySetInnerHTML={{ __html: t.raw("hero.title") as string }}
          />
          <p style={{ margin: 0, maxWidth: "46ch", fontSize: "clamp(16px,1.5vw,20px)", lineHeight: 1.9, color: "rgba(255,255,255,.84)" }}>
            {t("hero.lead")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
            <Button variant="primary" size="lg" href="#gaza" style={{ whiteSpace: "nowrap" }}>
              {t("hero.cta")}
            </Button>
            <span className="rp-scroll" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,.6)", fontSize: 13, fontWeight: 700 }}>
              {t("hero.scroll")}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </span>
          </div>
        </div>
      </section>

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      <section id="totals" style={{ position: "relative", background: "#0D1C25", padding: "88px 0", borderBlock: "1px solid rgba(211,154,39,.28)", overflow: "hidden" }}>
        <div style={{ ...SECTION, position: "relative", display: "grid", gap: 44 }}>
          <Rise style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 900, color: "var(--gold)", letterSpacing: ".16em" }}>
              {t("yearsTitle")}
            </span>
          </Rise>

          <div className="rp-bigstats" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", borderTop: "1px solid rgba(211,154,39,.35)" }}>
            {BIG_STATS.map((stat, index) => (
              <Rise
                key={stat.labelKey}
                style={{
                  display: "grid",
                  gap: 10,
                  padding: "30px 26px 30px 0",
                  alignContent: "start",
                  justifyItems: "start",
                  borderInlineEnd: index === BIG_STATS.length - 1 ? "0" : "1px solid rgba(255,255,255,.14)",
                }}
              >
                <Figure
                  value={stat.count}
                  style={{ fontSize: "clamp(44px,6.4vw,96px)", lineHeight: 1.08, fontWeight: 900, color: "var(--gold)", letterSpacing: "-.035em" }}
                />
                <b style={{ color: "#fff", fontSize: "clamp(16px,1.6vw,20px)", lineHeight: 1.45 }}>{t(stat.labelKey)}</b>
              </Rise>
            ))}
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <b style={{ fontSize: "clamp(20px,2vw,26px)", fontWeight: 900, color: "#fff" }}>{t("sectorsTitle")}</b>
            <div className="rp-sectors" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {SECTOR_STATS.map((sector) => (
                <Rise
                  key={sector.labelKey}
                  style={{ display: "grid", gap: 8, alignContent: "start", padding: "22px 24px", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, background: "rgba(255,255,255,.045)" }}
                >
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <Figure
                      value={sector.beneficiaries}
                      style={{ fontSize: "clamp(30px,3.4vw,46px)", lineHeight: 1.1, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}
                    />
                    <span style={{ color: "rgba(255,255,255,.7)", fontSize: 14, fontWeight: 800 }}>{t("unitBeneficiaries")}</span>
                  </span>
                  <b style={{ color: "var(--gold)", fontSize: 16.5, lineHeight: 1.4 }}>{t(sector.labelKey)}</b>
                  <span style={{ color: "rgba(255,255,255,.66)", fontSize: 13.5, lineHeight: 1.7 }}>
                    <b dir="ltr" style={{ unicodeBidi: "isolate", color: "rgba(255,255,255,.9)" }}>
                      {formatNumber(sector.projects)}
                    </b>{" "}
                    {t("unitProjects")}
                  </span>
                </Rise>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The three scenes ──────────────────────────────────────────────── */}
      {SCENES.map((scene) => (
        <section
          key={scene.id}
          id={scene.id}
          data-scene
          className="rp-scene"
          style={{ position: "relative", minHeight: scene.gold ? "100vh" : "96vh", display: "grid", alignItems: "center", overflow: "hidden", background: "#10212B" }}
        >
          <SceneImage id={scene.image} />
          <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: sceneGradient(scene.side), pointerEvents: "none" }} />

          <div className="rp-scene-inner" style={{ ...SECTION, position: "relative", width: "100%", padding: "88px 24px", display: "grid", gap: scene.gold ? 40 : 0 }}>
            <div
              className="rp-scene-copy"
              style={{
                display: "grid",
                gap: 16,
                justifyItems: "start",
                maxWidth: scene.gold ? "62%" : "56%",
                justifySelf: scene.side === "start" ? "start" : "end",
              }}
            >
              <Figure
                value={scene.count}
                style={{
                  fontSize: scene.gold ? "clamp(86px,13vw,200px)" : "clamp(72px,11vw,168px)",
                  lineHeight: 1.06,
                  fontWeight: 900,
                  color: scene.gold ? "var(--gold)" : "#fff",
                  letterSpacing: scene.gold ? "-.045em" : "-.04em",
                }}
              />
              <b style={{ fontSize: scene.gold ? "clamp(24px,2.6vw,38px)" : "clamp(22px,2.4vw,34px)", lineHeight: 1.32, fontWeight: 900, color: "#fff" }}>
                {t(`${scene.prefix}.label`)}
              </b>
              <p style={{ margin: 0, maxWidth: "46ch", fontSize: 17, lineHeight: 1.95, color: "rgba(255,255,255,.82)" }}>
                {t(`${scene.prefix}.text`)}
              </p>
              {scene.gold ? null : <span style={chipStyle}>{t(`${scene.prefix}.chip`)}</span>}
            </div>

            {scene.gold ? (
              <>
                <div className="rp-qudsmetrics" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", borderTop: "1px solid rgba(211,154,39,.4)" }}>
                  {QUDS_METRICS.map((metric, index) => (
                    <Rise
                      key={metric.labelKey}
                      style={{
                        display: "grid",
                        gap: 12,
                        padding: "38px 30px 8px",
                        alignContent: "start",
                        justifyItems: "start",
                        borderInlineStart: index === 0 ? "0" : "1px solid rgba(255,255,255,.14)",
                      }}
                    >
                      <Figure
                        value={metric.count}
                        style={{ fontSize: "clamp(44px,5.6vw,82px)", lineHeight: 1.06, fontWeight: 900, color: "#fff", letterSpacing: "-.03em" }}
                      />
                      <b style={{ color: "#fff", fontSize: 18, lineHeight: 1.45 }}>{t(metric.labelKey)}</b>
                      <span style={{ color: "rgba(255,255,255,.62)", fontSize: 13.5, lineHeight: 1.75 }}>{t(metric.noteKey)}</span>
                    </Rise>
                  ))}
                </div>
                <span style={chipStyle}>{t(`${scene.prefix}.chip`)}</span>
              </>
            ) : null}
          </div>
        </section>
      ))}

      {/* ── Voices ────────────────────────────────────────────────────────── */}
      <section id="voices" style={{ position: "relative", background: "#04201F", padding: "96px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="rp-pattern rp-pattern--voices" />
        <div style={{ ...SECTION, position: "relative" }}>
          <Rise style={{ display: "grid", gap: 14, marginBottom: 44 }}>
            <h2 style={SECTION_TITLE}>{t("voices.title")}</h2>
            <p style={{ margin: 0, maxWidth: "56ch", color: "rgba(255,255,255,.75)", fontSize: 17, lineHeight: 1.9 }}>{t("voices.lead")}</p>
          </Rise>

          <Rail step={360} prevLabel={tCommon("previous")} nextLabel={tCommon("next")} controlStyle="rounded">
            {VOICES.map((voice) => (
              <figure
                key={voice.whoKey}
                className="rp-voice"
                style={{ margin: 0, flex: "0 0 340px", display: "grid", alignContent: "start", background: "rgba(255,255,255,.05)", border: "1px solid rgba(211,154,39,.3)", borderRadius: 8, overflow: "hidden" }}
              >
                <span style={{ position: "relative", display: "block", aspectRatio: "4 / 3", background: "rgba(16,33,43,.7)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains */}
                  <img
                    src={drive(voice.image, 1200)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </span>
                <figcaption style={{ display: "grid", gap: 12, padding: 24 }}>
                  <span style={{ color: "#fff", fontSize: 17, lineHeight: 1.9 }}>{t(voice.quoteKey)}</span>
                  <span style={{ display: "grid", gap: 3, paddingTop: 12, borderTop: "1px solid rgba(211,154,39,.28)" }}>
                    <b style={{ color: "var(--gold)", fontSize: 14 }}>{t(voice.whoKey)}</b>
                    <span style={{ color: "rgba(255,255,255,.55)", fontSize: 12.5 }}>{t(voice.whereKey)}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </Rail>
        </div>
      </section>

      {/* ── Programmes ────────────────────────────────────────────────────── */}
      <section id="programs" style={{ position: "relative", background: "#10212B", padding: "96px 0", borderTop: "1px solid rgba(211,154,39,.3)", overflow: "hidden" }}>
        <div style={{ ...SECTION, position: "relative" }}>
          <Rise style={{ display: "grid", gap: 14, marginBottom: 44 }}>
            <h2 style={SECTION_TITLE}>{t("programs.title")}</h2>
            <p style={{ margin: 0, maxWidth: "60ch", color: "rgba(255,255,255,.75)", fontSize: 17, lineHeight: 1.9 }}>{t("programs.lead")}</p>
          </Rise>

          <div style={{ display: "grid", borderTop: "1px solid rgba(255,255,255,.12)" }}>
            {PROGRAMS.map((program) => (
              <Rise key={program.titleKey} className="rp-program">
                <span className="rp-program-icon" aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(211,154,39,.14)", color: "var(--gold)" }}>
                  <ProgramIcon name={program.icon} />
                </span>
                <span className="rp-program-title" style={{ display: "grid", gap: 5, minWidth: 0 }}>
                  <b style={{ color: "#fff", fontSize: 21, lineHeight: 1.35 }}>{t(program.titleKey)}</b>
                  <span style={{ color: "rgba(255,255,255,.6)", fontSize: 13 }}>
                    {t("programs.kpiPrefix")} {t(program.kpiKey)}
                  </span>
                </span>
                <span className="rp-program-text" style={{ display: "grid", gap: 9, minWidth: 0 }}>
                  <span style={{ color: "rgba(255,255,255,.72)", fontSize: 14.5, lineHeight: 1.8 }}>{t(program.textKey)}</span>
                  <span style={{ display: "block", height: 6, background: "rgba(255,255,255,.1)", borderRadius: 999, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${program.share}%`, background: "var(--gold)", borderRadius: 999 }} />
                  </span>
                </span>
                <b dir="ltr" className="rp-program-share" style={{ fontSize: 30, fontWeight: 900, color: "var(--gold)", unicodeBidi: "isolate", letterSpacing: "-.02em", textAlign: "end" }}>
                  {formatNumber(program.share)}%
                </b>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      <section id="timeline" style={{ position: "relative", background: "#04201F", padding: "96px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="rp-pattern rp-pattern--timeline" />
        <div style={{ ...SECTION, position: "relative" }}>
          <Rise style={{ display: "grid", gap: 14, marginBottom: 44 }}>
            <h2 style={SECTION_TITLE}>{t("timeline.title")}</h2>
          </Rise>
          <div style={{ display: "grid" }}>
            {MILESTONES.map((milestone, index) => (
              <Rise key={milestone.titleKey} className="rp-milestone">
                <b style={{ color: "var(--gold)", fontSize: 14, fontWeight: 900, paddingTop: 4 }}>{t(milestone.whenKey)}</b>
                {/* Latin digits, matched to every other figure on the page. */}
                <span dir="ltr" style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 8, background: "rgba(211,154,39,.16)", border: "1px solid rgba(211,154,39,.5)", color: "var(--gold)", fontWeight: 900, fontSize: 16, unicodeBidi: "isolate" }}>
                  {index + 1}
                </span>
                <span style={{ display: "grid", gap: 7, minWidth: 0 }}>
                  <b style={{ color: "#fff", fontSize: 21, lineHeight: 1.35 }}>{t(milestone.titleKey)}</b>
                  <span style={{ color: "rgba(255,255,255,.7)", fontSize: 15, lineHeight: 1.9, maxWidth: "62ch" }}>{t(milestone.textKey)}</span>
                </span>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* ── Documents ─────────────────────────────────────────────────────── */}
      <section id="reports" style={{ position: "relative", background: "#10212B", padding: "96px 0", borderTop: "1px solid rgba(211,154,39,.3)", overflow: "hidden" }}>
        <div className="rp-reports" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)", gap: 44, alignItems: "start" }}>
          <Rise className="rp-reports-side" style={{ display: "grid", gap: 16, justifyItems: "start", position: "sticky", top: 92 }}>
            <h2 style={SECTION_TITLE}>{t("reports.title")}</h2>
            <p style={{ margin: 0, maxWidth: "42ch", color: "rgba(255,255,255,.72)", fontSize: 16, lineHeight: 1.9 }}>{t("reports.lead")}</p>
            <Button variant="outline" href={ORG_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: "nowrap" }}>
              {t("reports.cta")}
            </Button>
          </Rise>

          <div style={{ display: "grid", borderTop: REPORTS.length ? "1px solid rgba(255,255,255,.12)" : "0" }}>
            {REPORTS.length === 0 ? (
              /* The handoff drops its own empty state in here on a white card,
                 because the section around it is dark. */
              <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
                <NoReports />
              </div>
            ) : null}
            {REPORTS.map((report) => (
              <a
                key={report.file}
                href={`${REPORT_BASE}/${report.file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rp-report"
                style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 4px", borderBottom: "1px solid rgba(255,255,255,.12)", color: "#fff" }}
              >
                <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <b style={{ fontSize: 17.5, lineHeight: 1.45, color: "#fff" }}>{t(report.titleKey)}</b>
                  <span style={{ color: "rgba(255,255,255,.55)", fontSize: 13 }}>PDF · {t(report.metaKey)}</span>
                </span>
                <span style={{ marginInlineStart: "auto", flex: "0 0 auto", padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.16)", color: "rgba(255,255,255,.66)", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>
                  {t("reportStatusAvailable")}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing call ──────────────────────────────────────────────────── */}
      <section className="rp-closing" style={{ position: "relative", minHeight: "62vh", display: "grid", alignItems: "center", background: "#10212B", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains */}
        <img src={drive(CLOSING_IMAGE, 2000)} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #10212B 12%, rgba(16,33,43,.78) 58%, rgba(16,33,43,.45))", pointerEvents: "none" }} />
        <div style={{ ...SECTION, position: "relative", width: "100%", padding: "72px 24px", display: "grid", gap: 20, justifyItems: "center", textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3.6vw,52px)", lineHeight: 1.25, fontWeight: 900, color: "#fff", letterSpacing: "-.02em" }}>
            {t("closing.title")}
          </h2>
          <p style={{ margin: 0, maxWidth: "52ch", color: "rgba(255,255,255,.82)", fontSize: 17, lineHeight: 1.9 }}>{t("closing.lead")}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
            <Button variant="primary" size="lg" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("closing.cta1")}
            </Button>
            <Button variant="gold" size="lg" href={miaPath("waqf", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("closing.cta2")}
            </Button>
          </div>
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}

/** A scene photograph with the handoff's slow Ken Burns push, on reveal. */
function SceneImage({ id }: { id: string }) {
  const { ref, shown } = useMinbarReveal<HTMLImageElement>(0.2);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains
    <img
      ref={ref}
      src={drive(id, 2000)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`rp-kenburns${shown ? " in" : ""}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
