"use client";

import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { drive, QUDS_IFTAR, QUDS_CITY } from "@/lib/minbar/content/media";
import type { MinbarProject } from "@/lib/minbar/projects";
import type { VerseBlock } from "@/lib/minbar/quran";
import { Button } from "@/components/minbar/ds";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import AqsaPlan from "./AqsaPlan";

/**
 * The blessed Al-Aqsa Mosque — ported from `Minbar/المسجد الأقصى.dc.html`.
 *
 * The longest explanatory page on the site, and the one with a thesis: the
 * mosque is everything inside the wall, not the golden dome alone. It runs
 * from that distinction through the plan, the mosque's standing, Saladin's
 * minbar and the 1969 fire, its landmarks, gates, history, what it faces now,
 * who administers it, and the foundation's own work there.
 *
 * Every sentence is a reviewed key in the `aqsa` namespace. The two Qur'anic
 * verses come from the `quran` namespace so they stay Arabic with the reviewed
 * translation of the meaning beneath, rather than the handoff's inline Arabic
 * that no other language edition could read.
 */

const QUICK_FACTS = [
  { eyebrow: "factArea", value: "factAreaV", label: "factAreaL" },
  { eyebrow: "factSides", value: "factSidesV", label: "factSidesL" },
  { eyebrow: "factRank", value: "factRankV", label: "factRankL" },
  { eyebrow: "factLandmarks", value: "factLandmarksV", label: "factLandmarksL" },
];

const BOUNDARIES = [
  { label: "bNorthWest", text: "bNorthWestX" },
  { label: "bSouth", text: "bSouthX" },
  { label: "bEast", text: "bEastX" },
  { label: "bCentre", text: "bCentreX" },
];

/** Map key. The swatches match the marks drawn on the plan. */
const LEGEND: ReadonlyArray<{ label: string; swatch: React.CSSProperties }> = [
  { label: "legendOpen", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#556B2F" } },
  { label: "legendMaghariba", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#B34732" } },
  { label: "legendClosed", swatch: { width: 14, height: 14, borderRadius: "50%", background: "#9AA5A5" } },
  { label: "legendMinarets", swatch: { width: 14, height: 14, background: "#C98A2B" } },
  { label: "legendSublevelPrayer", swatch: { width: 16, height: 12, border: "2px dashed #B34732" } },
];

/**
 * The mosque's standing. The first is the Qur'anic verse itself, which is why
 * it carries no `text` key — it is rendered from the `quran` namespace.
 */
const VIRTUES = [1, 2, 3, 4, 5, 6].map((n) => ({
  title: `virtue${n}Title`,
  text: n === 1 ? null : `virtue${n}Text`,
  source: `virtue${n}Source`,
}));

/** The minbar's four figures. The last is the fire, and it is set in red. */
const MINBAR_FACTS: ReadonlyArray<{ value: string | null; label: string; ltr?: boolean; fire?: boolean }> = [
  { value: null, label: "mnPiecesL", ltr: true },
  { value: "mnHeightV", label: "mnHeightL" },
  { value: "mnYearV", label: "mnYearL" },
  { value: "mnFireV", label: "mnFireL", fire: true },
];

/** Nine landmarks, each with a photograph and two stated facts. */
const LANDMARKS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
  tag: `lm${n}_tag`,
  title: `lm${n}_title`,
  text: `lm${n}_text`,
  facts: [
    { k: `lm${n}_k1`, v: `lm${n}_v1` },
    { k: `lm${n}_k2`, v: `lm${n}_v2` },
  ],
}));

/** The thirteen gates, each with its wall and its state. */
const GATES: ReadonlyArray<{ name: string; dir: string; state: string }> = [
  { name: "g_asbat", dir: "dirN", state: "stOpen" },
  { name: "g_hitta", dir: "dirN", state: "stOpen" },
  { name: "g_faisal", dir: "dirN", state: "stOpen" },
  { name: "g_ghawanima", dir: "dirNW", state: "stOpen" },
  { name: "g_nazir", dir: "dirW", state: "stOpen" },
  { name: "g_hadid", dir: "dirW", state: "stOpen" },
  { name: "g_qattanin", dir: "dirW", state: "stOpen" },
  { name: "g_mathara", dir: "dirW", state: "stOpen" },
  { name: "g_silsila", dir: "dirW", state: "stOpen" },
  { name: "g_maghariba", dir: "dirW", state: "stOcc" },
  { name: "g_rahma", dir: "dirE", state: "stClosed" },
  { name: "g_south3", dir: "dirS", state: "stClosed" },
  { name: "g_janaiz", dir: "dirN", state: "stClosed" },
];

const TIMELINE = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  year: `tl${n}_year`,
  title: `tl${n}_title`,
  text: `tl${n}_text`,
}));

const THREATS = [1, 2, 3, 4, 5, 6].map((n) => ({ title: `th${n}_title`, text: `th${n}_text` }));

const CUSTODY = [1, 2, 3].map((n) => ({ title: `cust${n}`, text: `cust${n}X` }));

/** Photographs, one per landmark, cycling the two Al-Quds banks. */
const LANDMARK_PHOTOS = [...QUDS_IFTAR, ...QUDS_CITY];

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const H2 = { margin: 0, fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.25, fontWeight: 900 } as const;
const DIAMOND: React.CSSProperties = { flex: "0 0 auto", width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" };

export interface AqsaPageProps {
  /** Al-Anbiya 71, above the page. */
  verse: VerseBlock;
  /** Al-Isra 1 — the verse that is itself the first of the mosque's virtues. */
  isra: VerseBlock;
  projects: MinbarProject[];
}

export default function AqsaPage({ verse, isra, projects }: AqsaPageProps) {
  const locale = useLocale();
  const t = useTranslations("aqsa");
  const tCommon = useTranslations("common");

  return (
    <div className="aq-page">
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

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "#A8660C", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- sets the section height; not a fixed-size image */}
        <img
          src="/minbar/assets/aqsa-hero-3d.png"
          alt={t("heroAlt")}
          style={{ display: "block", width: "100%", height: "clamp(360px, 46vw, 640px)", objectFit: "cover", objectPosition: "50% 22%" }}
        />
        <div style={{ position: "absolute", inset: 0 }}>
          <div className="aq-hero" style={{ maxWidth: 1240, height: "100%", margin: "0 auto", padding: "4% 24px 0", display: "grid", gridTemplateColumns: "minmax(0,52%) minmax(0,1fr)", alignContent: "start" }}>
            <div style={{ display: "grid", gap: 12, justifyItems: "start", textAlign: "start" }}>
              <h1 style={{ margin: 0, fontSize: "clamp(26px,3vw,44px)", lineHeight: 1.35, fontWeight: 900, color: "#fff", textShadow: "0 2px 20px rgba(70,40,4,.45)" }}>
                {t("pageTitle")}
              </h1>
              <div aria-hidden="true" style={{ width: 90, height: 2, background: "#fff", opacity: 0.8 }} />
              <p style={{ margin: 0, fontSize: "clamp(13px,1.2vw,17px)", lineHeight: 1.8, color: "rgba(255,255,255,.94)", textShadow: "0 2px 16px rgba(70,40,4,.45)" }}>
                {t("heroLead")}
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <Button variant="primary" href="#role" style={{ whiteSpace: "nowrap" }}>{t("supportAqsaProjects")}</Button>
                {/* A scrim behind the outline button: it sits over a bright
                    photograph, where a plain white hairline disappears. */}
                <Button
                  variant="outline"
                  href={miaPath("jerusalem", locale)}
                  style={{ whiteSpace: "nowrap", background: "rgba(16,33,43,.55)", backdropFilter: "blur(3px)", borderColor: "rgba(255,255,255,.6)" }}
                >
                  {t("learnJerusalem")}
                </Button>
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
            <div key={fact.eyebrow} style={{ display: "grid", gap: 10, padding: "28px 26px", alignContent: "start", borderInlineStart: index === 3 ? "0" : "1px solid var(--border)" }}>
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

      {/* ── What Al-Aqsa is ───────────────────────────────────────────────── */}
      <section id="what" style={{ position: "relative", background: "transparent", padding: "66px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div className="qd-two" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)", gap: 46, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <h2 style={H2}>{t("whatIsAqsa")}</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>{t("whatIsAqsaText")}</p>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
              {t("goldenDomeIs")} <b style={{ color: "var(--deep)" }}>{t("domeOfRockFull")}</b> {t("inCentreAndBuilding")}{" "}
              <b style={{ color: "var(--deep)" }}>{t("qibliMusalla")}</b>
              {t("bothArePart")}
            </p>
            <div style={{ display: "grid", gap: 10, padding: "20px 22px", background: "#fff", border: "1px solid rgba(211,154,39,.5)", borderInlineStart: "3px solid var(--gold)" }}>
              <b style={{ fontSize: 16 }}>{t("bewareConfusion")}</b>
              <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.85 }}>{t("confusionText")}</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-ratio panel, sized as a share of its column */}
            <img
              src="/minbar/assets/aqsa-compound-aerial.jpg"
              alt={t("aerialAlt")}
              loading="lazy"
              style={{ width: "100%", maxWidth: 330, aspectRatio: "4 / 3", objectFit: "cover", background: "var(--deep)" }}
            />
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
        </div>
      </section>

      {/* ── The plan ──────────────────────────────────────────────────────── */}
      <section id="plan" style={{ background: "#fff", padding: "66px 0", borderBlock: "1px solid var(--border)" }}>
        <div className="qd-map" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 34, alignItems: "start" }}>
          <div style={{ width: "100%", background: "#fff", border: "1px solid rgba(211,154,39,.5)", padding: 18 }}>
            <AqsaPlan />
          </div>
          <div className="qd-map-side" style={{ display: "grid", gap: 18, alignContent: "start", position: "sticky", top: 92 }}>
            <div>
              <h2 style={{ ...H2, margin: "0 0 10px", fontSize: "clamp(24px,2.6vw,34px)" }}>{t("mosqueMap")}</h2>
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

      {/* ── Why this standing ─────────────────────────────────────────────── */}
      <section id="status" style={{ position: "relative", background: "var(--sand)", padding: "66px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div style={{ ...SECTION, position: "relative" }}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("whyThisStanding")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "74ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("whyLead")}</p>
          <div className="aq-virtues" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 18 }}>
            {VIRTUES.map((virtue) => (
              <div key={virtue.title} style={{ display: "grid", gap: 10, alignContent: "start", padding: 24, background: "#fff", border: "1px solid var(--border)" }}>
                <b style={{ fontSize: 19, lineHeight: 1.4 }}>{t(virtue.title)}</b>
                {virtue.text ? (
                  <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>{t(virtue.text)}</span>
                ) : (
                  /* The first virtue is the verse itself: Arabic always, with
                     the reviewed translation of the meaning beneath it. */
                  <>
                    <span dir="rtl" style={{ fontFamily: "var(--font-amiri), Amiri, serif", fontSize: 17, lineHeight: 2, color: "var(--deep)", unicodeBidi: "isolate" }}>
                      {isra.arabic}
                    </span>
                    {isra.translation ? (
                      <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>{isra.translation}</span>
                    ) : null}
                  </>
                )}
                <span style={{ color: "var(--gold)", fontSize: 13, fontWeight: 800 }}>{t(virtue.source)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Saladin's minbar ──────────────────────────────────────────────── */}
      <section id="minbar" style={{ background: "#fff", borderBlock: "1px solid var(--border)", padding: "66px 0" }}>
        <div style={SECTION}>
          <div className="qd-two" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)", gap: 46, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 16 }}>
              <span style={{ display: "inline-flex", width: "fit-content", alignItems: "center", gap: 9, fontSize: 12, fontWeight: 900, letterSpacing: ".08em", color: "#8A5D16" }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                {t("minbarBearsName")}
              </span>
              <h2 style={H2}>{t("saladinMinbar")}</h2>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>{t("minbarP1")}</p>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
                {t("minbarP2a")} <b style={{ color: "var(--deep)" }}>{t("minbarNurName")}</b> {t("minbarP2b")}{" "}
                <b style={{ color: "var(--deep)" }}>{t("minbarSaladinName")}</b> {t("minbarP2c")}
              </p>
              <p style={{ margin: 0, fontSize: 17, lineHeight: 1.95, color: "var(--muted)" }}>
                {t("minbarP3a")} <b style={{ color: "var(--deep)" }}>{t("minbarTashiq")}</b>
                {t("minbarP3b")}
              </p>
            </div>

            <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
              <div className="aq-mnfacts" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
                {MINBAR_FACTS.map((fact) => (
                  <div
                    key={fact.label}
                    style={{ display: "grid", gap: 5, padding: 20, background: "var(--sand)", border: "1px solid var(--border)", borderTop: `3px solid ${fact.fire ? "var(--red)" : "var(--gold)"}` }}
                  >
                    {fact.value ? (
                      <b style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, ...(fact.fire ? { color: "var(--red)" } : {}) }}>{t(fact.value)}</b>
                    ) : (
                      /* The piece count is a plain figure, isolated so an RTL
                         paragraph cannot reorder its digits. */
                      <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 30, fontWeight: 900, lineHeight: 1 }}>
                        {new Intl.NumberFormat(locale).format(12000)}
                      </b>
                    )}
                    <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.7 }}>{t(fact.label)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 10, padding: 22, background: "#fff", border: "1px solid rgba(169,52,40,.35)", borderInlineStart: "3px solid var(--red)" }}>
                <b style={{ fontSize: 16.5 }}>{t("fireWitnessTitle")}</b>
                <span style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>
                  {t("fireWitnessPre")} <b style={{ color: "var(--deep)" }}>{t("fireWitnessName")}</b>
                  {t("fireWitnessPost")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Landmarks ─────────────────────────────────────────────────────── */}
      <section id="landmarks" style={{ background: "transparent", padding: "66px 0" }}>
        <div style={SECTION}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("landmarksTitle")}</h2>
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
                  <span style={{ display: "grid", gap: 6, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    {landmark.facts.map((fact) => (
                      <span key={fact.k} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, lineHeight: 1.7 }}>
                        <span style={{ color: "var(--muted)", fontWeight: 800, flex: "0 0 auto" }}>{t(fact.k)}</span>
                        <span style={{ color: "var(--deep)" }}>{t(fact.v)}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gates and walls ───────────────────────────────────────────────── */}
      <section id="gates" style={{ position: "relative", background: "#fff", padding: "66px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div className="qd-two" style={{ ...SECTION, position: "relative", display: "grid", gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)", gap: 46, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
            <h2 style={H2}>{t("gatesAndWalls")}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("gatesLead")}</p>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>{t("maghrebiGateNote")}</p>
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

      {/* ── Milestones ────────────────────────────────────────────────────── */}
      <section id="history" style={{ background: "transparent", padding: "66px 0" }}>
        <div style={SECTION}>
          <h2 style={{ ...H2, margin: "0 0 26px" }}>{t("milestones")}</h2>
          {/* The cells share their borders, so the eight read as one grid
              rather than eight separate cards. */}
          <div className="aq-timeline" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
            {TIMELINE.map((entry, index) => (
              <div
                key={entry.title}
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "22px 20px",
                  alignContent: "start",
                  background: "#fff",
                  border: "1px solid var(--border)",
                  marginInlineStart: index % 4 === 0 ? 0 : -1,
                  marginTop: index >= 4 ? -1 : 0,
                }}
              >
                {/* Hijri and Gregorian years, set in Arabic numerals as written
                    and isolated so they cannot reorder inside a Latin page. */}
                <span dir="rtl" style={{ unicodeBidi: "isolate", color: "var(--gold)", fontSize: 14, fontWeight: 900 }}>{t(entry.year)}</span>
                <b style={{ fontSize: 17, lineHeight: 1.4 }}>{t(entry.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(entry.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What it faces now ─────────────────────────────────────────────── */}
      <section id="threats" style={{ position: "relative", background: "var(--sand)", padding: "66px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" className="qd-pattern" />
        <div style={{ ...SECTION, position: "relative" }}>
          <h2 style={{ ...H2, margin: "0 0 10px" }}>{t("todayTitle")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "76ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("todayLead")}</p>
          <div className="qd-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {THREATS.map((threat) => (
              <div key={threat.title} style={{ display: "grid", gap: 8, alignContent: "start", padding: 22, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--red)" }}>
                <b style={{ fontSize: 18, lineHeight: 1.4 }}>{t(threat.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(threat.text)}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "20px 0 0", color: "var(--muted)", fontSize: 13 }}>{t("figuresNote")}</p>
        </div>
      </section>

      {/* ── Who administers it ────────────────────────────────────────────── */}
      <section id="custody" style={{ background: "#fff", borderBlock: "1px solid var(--border)", padding: "60px 0" }}>
        <div className="qd-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 44, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <h2 style={{ ...H2, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.3 }}>{t("whoManages")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.95, color: "var(--muted)" }}>
              {t("custodyPre")} <b style={{ color: "var(--deep)" }}>{t("custodyAwqaf")}</b>
              {t("custodyPost")}
            </p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {CUSTODY.map((entry) => (
              <div key={entry.title} style={{ display: "grid", gap: 6, padding: "20px 22px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)" }}>
                <b style={{ fontSize: 16 }}>{t(entry.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.85 }}>{t(entry.text)}</span>
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
            <h2 style={{ margin: 0, fontSize: "clamp(26px,2.9vw,40px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("ctaTitle")}</h2>
            <p style={{ margin: 0, maxWidth: "62ch", color: "rgba(255,255,255,.8)", fontSize: 16, lineHeight: 1.9 }}>{t("ctaText")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {tCommon("donate")}
            </Button>
            <Button variant="outline" size="lg" href={miaPath("waqf", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("endowInQuds")}
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
