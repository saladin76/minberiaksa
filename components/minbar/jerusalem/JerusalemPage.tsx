"use client";

import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { drive, QUDS_CITY, QUDS_IFTAR } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import type { VerseBlock } from "@/lib/minbar/quran";
import { Button } from "@/components/minbar/ds";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import OldCityMap from "./OldCityMap";

/**
 * Al-Quds and the Old City — ported from
 * `Minbar/القدس والبلدة القديمة.dc.html`.
 *
 * A long explanatory page: the city's shape, its plan, its four quarters, its
 * gates, the landmarks inside the wall, the pressures on it, its legal status,
 * and then the foundation's own projects there.
 *
 * Every figure and every sentence is a reviewed key in the `jerusalem`
 * namespace — nothing on this page is asserted from the port.
 */

const QUICK_FACTS = [
  { eyebrow: "qfOldCity", value: "qfOldCityVal", label: "qfOldCityLbl" },
  { eyebrow: "qfWall", value: "qfWallVal", label: "qfWallLbl" },
  { eyebrow: "qfGates", value: "qfGatesVal", label: "qfGatesLbl" },
  { eyebrow: "qfHeritage", value: "qfHeritageVal", label: "qfHeritageLbl" },
];

const BOUNDARIES = [
  { label: "bN", text: "bNText" },
  { label: "bW", text: "bWText" },
  { label: "bS", text: "bSText" },
  { label: "bE", text: "bEText" },
];

/** Map key. The swatch colours match the circles drawn on the plan. */
const LEGEND: ReadonlyArray<{ label: string; swatch: React.CSSProperties }> = [
  { label: "legOpen", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#556B2F" } },
  { label: "legMaghariba", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#B34732" } },
  { label: "legClosed", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#9AA5A5" } },
  { label: "legHaram", swatch: { width: 16, height: 12, border: "2px solid #C98A2B", background: "#FDF6E6" } },
];

const QUARTERS = [
  { title: "qMuslim", text: "qMuslimText" },
  { title: "qChristian", text: "qChristianText" },
  { title: "qArmenian", text: "qArmenianText" },
  { title: "qSharaf", text: "qSharafText" },
];

/** The eight gates, each with the wall it stands in and its current state. */
const GATES: ReadonlyArray<{ name: string; dir: string; state: string }> = [
  { name: "gAmoud2", dir: "wallDirN", state: "wallOpen" },
  { name: "gSahera", dir: "wallDirN", state: "wallOpen" },
  { name: "gNew", dir: "wallDirNW", state: "wallOpen" },
  { name: "gKhalil", dir: "wallDirW", state: "wallOpen" },
  { name: "gDawud", dir: "wallDirS", state: "wallOpen" },
  { name: "gMagharibaJ", dir: "wallDirS", state: "wallOcc" },
  { name: "gAsbat2", dir: "wallDirE", state: "wallOpen" },
  { name: "gRahma2", dir: "wallDirE", state: "wallClosed" },
];

const LANDMARKS = [1, 2, 3, 4, 5, 6].map((n) => ({
  tag: `lm${n}tag`,
  title: `lm${n}title`,
  text: `lm${n}text`,
}));

const THREATS = [1, 2, 3, 4, 5, 6].map((n) => ({ title: `th${n}`, text: `th${n}t` }));

const STATUS_FACTS = [
  { title: "statusHeritage", text: "statusHeritageText" },
  { title: "statusEndangered", text: "statusEndangeredText" },
  { title: "statusAwqaf", text: "statusAwqafText" },
];

/** Photographs of the city, one per landmark, cycling the two Al-Quds banks. */
const LANDMARK_PHOTOS = [...QUDS_CITY, ...QUDS_IFTAR];

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const H2 = { margin: 0, fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.25, fontWeight: 900 } as const;
const DIAMOND: React.CSSProperties = { flex: "0 0 auto", width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" };

export interface JerusalemPageProps {
  verse: VerseBlock;
  /** Projects in Al-Quds and around Al-Aqsa, already limited by the route. */
  projects: MinbarProject[];
}

export default function JerusalemPage({ verse, projects }: JerusalemPageProps) {
  const locale = useLocale();
  const t = useTranslations("jerusalem");
  const tCommon = useTranslations("common");

  return (
    <div className="qd-page">
      {/* ── Verse ─────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "#fff", borderBottom: "1px solid rgba(211,154,39,.45)" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "22px 24px", display: "grid", justifyItems: "center", textAlign: "center" }}>
          <p dir="rtl" style={{ margin: 0, fontFamily: "var(--font-amiri), Amiri, Almarai, Cairo, serif", fontSize: "clamp(18px,1.8vw,24px)", lineHeight: 2.1, color: "var(--deep)" }}>
            {verse.arabic}
          </p>
          {verse.translation ? (
            <>
              <p style={{ margin: "10px 0 0", maxWidth: "72ch", fontSize: 15, lineHeight: 1.9, color: "var(--muted)", textWrap: "pretty" }}>
                {verse.translation}
              </p>
              <span style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--muted)", opacity: 0.85 }}>
                <span aria-hidden="true" style={{ width: 22, height: 1, background: "rgba(211,154,39,.5)" }} />
                {verse.attribution}
                <span aria-hidden="true" style={{ width: 22, height: 1, background: "rgba(211,154,39,.5)" }} />
              </span>
            </>
          ) : null}
        </div>
      </section>

      {/* ── Hero over the aerial view ─────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern qd-pattern--dark" />
        {/* eslint-disable-next-line @next/next/no-img-element -- sets the section height; not a fixed-size image */}
        <img src="/minbar/assets/quds-aerial.png" alt={t("aerialAlt")} style={{ display: "block", width: "100%", height: "auto" }} />
        <div style={{ position: "absolute", inset: 0 }}>
          <div className="qd-hero" style={{ maxWidth: 1240, height: "100%", margin: "0 auto", padding: "4% 24px 0", display: "grid", gridTemplateColumns: "minmax(0,52%) minmax(0,1fr)", alignContent: "start" }}>
            <div style={{ display: "inline-grid", justifySelf: "start", gap: 12, justifyItems: "start", padding: "16px 18px", background: "rgba(0,0,0,.42)" }}>
              <h1 style={{ margin: 0, fontSize: "clamp(26px,3vw,44px)", lineHeight: 1.35, fontWeight: 900, color: "#fff", textShadow: "0 2px 20px rgba(0,0,0,.65)" }}>
                {t("pageTitle")}
              </h1>
              <div aria-hidden="true" style={{ width: 90, height: 2, background: "#fff", opacity: 0.8 }} />
              <p style={{ margin: 0, maxWidth: "48ch", fontSize: "clamp(13px,1.2vw,17px)", lineHeight: 1.8, color: "rgba(255,255,255,.95)", textShadow: "0 2px 16px rgba(0,0,0,.7)" }}>
                {t("heroLead")}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <Button variant="primary" href="#role" style={{ whiteSpace: "nowrap" }}>{t("supportQudsPeople")}</Button>
                <Button variant="outline" href="#map" style={{ whiteSpace: "nowrap" }}>{t("oldCityPlan")}</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick facts ───────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "#fff", borderBottom: "1px solid rgba(211,154,39,.45)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div className="qd-facts" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
          {QUICK_FACTS.map((fact, index) => (
            <div
              key={fact.eyebrow}
              style={{ display: "grid", gap: 10, padding: "28px 26px", alignContent: "start", borderInlineStart: index === 3 ? "0" : "1px solid var(--border)" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span aria-hidden="true" style={DIAMOND} />
                <span style={{ fontSize: 11, fontWeight: 900, color: "var(--gold)", letterSpacing: ".1em" }}>{t(fact.eyebrow)}</span>
              </span>
              <b style={{ fontSize: "clamp(26px,2.4vw,34px)", fontWeight: 900, lineHeight: 1.15 }}>{t(fact.value)}</b>
              <span style={{ color: "var(--muted)", fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{t(fact.label)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── The city ──────────────────────────────────────────────────────── */}
      <section id="city" style={{ position: "relative", background: "transparent", padding: "66px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div className="qd-two" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 46, alignItems: "stretch" }}>
          <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
            <h2 style={H2}>{t("ourOldCity")}</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
              {t("introText")} {t("introTextTail")}
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
              {t("wallBuiltBy")} <b style={{ color: "var(--deep)" }}>{t("suleiman")}</b> {t("wallDetails")}
            </p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
              {t("newestGate")} <b style={{ color: "var(--deep)" }}>{t("gateNew")}</b>
              {t("newGateDetails")}
            </p>
            <div style={{ display: "grid", gap: 10, padding: "20px 22px", background: "#fff", border: "1px solid rgba(211,154,39,.5)", borderInlineStart: "3px solid var(--gold)" }}>
              <b style={{ fontSize: 16 }}>{t("stayingIsBattle")}</b>
              <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.85 }}>{t("stayingText")}</span>
            </div>
            <div style={{ display: "grid", gap: 12, padding: 22, background: "var(--sand)", border: "1px solid var(--border)" }}>
              {BOUNDARIES.map((boundary) => (
                <span key={boundary.label} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 15, lineHeight: 1.7 }}>
                  <span aria-hidden="true" style={DIAMOND} />
                  <span>
                    <b>{t(boundary.label)}</b> <span style={{ color: "var(--muted)" }}>{t(boundary.text)}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
          <span style={{ position: "relative", display: "block", alignSelf: "stretch", minHeight: 560, background: "var(--sand)", border: "1px solid var(--border)", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, outside the configured image domains */}
            <img
              src={drive("1lv4Mmx0GPxyytDHGhHW6RgGdmR8NIE4z", 1400)}
              alt={t("oldCityPhotoAlt")}
              loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          </span>
        </div>
      </section>

      {/* ── The plan ──────────────────────────────────────────────────────── */}
      <section id="map" style={{ background: "#fff", padding: "66px 0", borderBlock: "1px solid var(--border)" }}>
        <div className="qd-map" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 34, alignItems: "start" }}>
          <div style={{ width: "100%", background: "#fff", border: "1px solid rgba(211,154,39,.5)", padding: 18 }}>
            <OldCityMap />
          </div>
          <div className="qd-map-side" style={{ display: "grid", gap: 18, alignContent: "start", position: "sticky", top: 92 }}>
            <div>
              <h2 style={{ ...H2, margin: "0 0 10px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.25 }}>{t("oldCityMap")}</h2>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>{t("mapCaption")}</p>
            </div>
            <div style={{ display: "grid", gap: 12, padding: 20, background: "var(--sand)", border: "1px solid var(--border)" }}>
              {LEGEND.map((entry) => (
                <span key={entry.label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, fontWeight: 700 }}>
                  <span aria-hidden="true" style={{ flex: "0 0 auto", ...entry.swatch }} />
                  {t(entry.label)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The four quarters ─────────────────────────────────────────────── */}
      <section id="quarters" style={{ position: "relative", background: "var(--sand)", padding: "66px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div style={{ ...SECTION, position: "relative" }}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("ourFourQuarters")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "74ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("quartersLead")}</p>
          <div className="qd-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 18 }}>
            {QUARTERS.map((quarter) => (
              <div key={quarter.title} style={{ display: "grid", gap: 10, alignContent: "start", padding: 24, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)" }}>
                <b style={{ fontSize: 19, lineHeight: 1.4 }}>{t(quarter.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.9 }}>{t(quarter.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The gates ─────────────────────────────────────────────────────── */}
      <section id="gates" style={{ position: "relative", background: "#fff", padding: "66px 0", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div className="qd-two" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)", gap: 46, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
            <h2 style={H2}>{t("wallGates")}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("gatesLead")}</p>
            <a href="#map" style={{ color: "var(--red)", fontWeight: 800 }}>{t("seeMap")}</a>
          </div>
          <div className="qd-gates" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "0 22px" }}>
            {GATES.map((gate) => (
              <span key={gate.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", fontSize: 15 }}>
                <span aria-hidden="true" style={DIAMOND} />
                <b style={{ fontWeight: 800 }}>{t(gate.name)}</b>
                <span style={{ marginInlineStart: "auto", color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>
                  {t(gate.dir)} · {t(gate.state)}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Landmarks ─────────────────────────────────────────────────────── */}
      <section id="landmarks" style={{ background: "transparent", padding: "66px 0" }}>
        <div style={SECTION}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("landmarksInside")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "74ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("landmarksLead")}</p>
          <div className="qd-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
            {LANDMARKS.map((landmark, index) => (
              <div key={landmark.title} style={{ display: "grid", alignContent: "start", background: "#fff", border: "1px solid var(--border)" }}>
                <span style={{ position: "relative", display: "block", height: 210, background: "var(--sand)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
                  <span
                    role="img"
                    aria-label={t(landmark.title)}
                    style={{ position: "absolute", inset: 0, backgroundImage: `url('${drive(LANDMARK_PHOTOS[index % LANDMARK_PHOTOS.length], 900)}')`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                </span>
                <span style={{ display: "grid", gap: 10, padding: 22 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span aria-hidden="true" style={DIAMOND} />
                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--gold)", letterSpacing: ".08em" }}>{t(landmark.tag)}</span>
                  </span>
                  <b style={{ fontSize: 19, lineHeight: 1.4 }}>{t(landmark.title)}</b>
                  <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.9 }}>{t(landmark.text)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pressures ─────────────────────────────────────────────────────── */}
      <section id="threats" style={{ position: "relative", background: "var(--sand)", padding: "66px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div style={{ ...SECTION, position: "relative" }}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("whatIsWanted")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "76ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("pressureLead")}</p>
          <div className="qd-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {THREATS.map((threat) => (
              <div key={threat.title} style={{ display: "grid", gap: 8, alignContent: "start", padding: 22, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--red)" }}>
                <b style={{ fontSize: 18, lineHeight: 1.4 }}>{t(threat.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(threat.text)}</span>
              </div>
            ))}
          </div>
          {/* The handoff prints its sources note beneath the figures, not in a
              tooltip — a claim about a city carries where it came from. */}
          <p style={{ margin: "20px 0 0", color: "var(--muted)", fontSize: 13 }}>{t("figuresNote")}</p>
        </div>
      </section>

      {/* ── Legal status ──────────────────────────────────────────────────── */}
      <section id="status" style={{ background: "#fff", borderBlock: "1px solid var(--border)", padding: "60px 0" }}>
        <div className="qd-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 44, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <h2 style={{ ...H2, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.3 }}>{t("cityStatus")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.95, color: "var(--muted)" }}>{t("statusPara")}</p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {STATUS_FACTS.map((fact) => (
              <div key={fact.title} style={{ display: "grid", gap: 6, padding: "20px 22px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)" }}>
                <b style={{ fontSize: 16 }}>{t(fact.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.85 }}>{t(fact.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our work ──────────────────────────────────────────────────────── */}
      <section id="role" style={{ background: "transparent", padding: "66px 0" }}>
        <div style={SECTION}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 26 }}>
            <div>
              <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("ourRole")}</h2>
              <p style={{ margin: 0, maxWidth: "70ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("ourRoleLead")}</p>
            </div>
            <Button variant="light" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("allQudsProjects")}
            </Button>
          </div>
          {projects.length ? (
            <div className="qd-work" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
              {projects.map((project) => (
                <ProjectDonateCard key={project.id} project={project} />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Closing call ──────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", padding: "60px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern qd-pattern--dark" />
        <div style={{ ...SECTION, position: "relative", display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 12, flex: "1 1 480px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(26px,2.9vw,40px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("ctaHeading")}</h2>
            <p style={{ margin: 0, maxWidth: "62ch", color: "rgba(255,255,255,.8)", fontSize: 16, lineHeight: 1.9 }}>{t("ctaText")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {tCommon("donate")}
            </Button>
            <Button variant="outline" size="lg" href={miaPath("aqsa", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("aqsaPageLink")}
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
