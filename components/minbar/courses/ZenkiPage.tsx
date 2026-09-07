"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { youtubeEmbed } from "@/lib/minbar/content/media";
import {
  ZENKI_ANNEX,
  ZENKI_QUOTES,
  ZENKI_UNITS,
  ZENKI_VOCAB,
  ZENKI_WHO_TEXT,
  ZENKI_WHY_MINBAR_TEXT,
} from "@/lib/minbar/content/zenki";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";

/**
 * The Nur ad-Din Zangi course — ported from
 * `Minbar/دورة نور الدين زنكي.dc.html`.
 *
 * The one course with a page of its own: what it is, who Nur ad-Din was, why
 * the foundation is named for a minbar, the concepts it establishes, the ten
 * sessions with their topics, objectives and bibliography, the annex for
 * preachers, and the two ways it is run.
 *
 * Every label here is translated. The syllabus is not, deliberately — see
 * `lib/minbar/content/zenki.ts`. Those blocks are marked `lang="ar" dir="rtl"`
 * so they render and are announced correctly inside a page read in any other
 * language.
 */

/** The course's introductory recording, from the handoff's hero embed. */
const INTRO_VIDEO = "vC1A_17VBpQ";

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const H2 = { margin: 0, fontSize: "clamp(21px,2.2vw,29px)", fontWeight: 900 } as const;

/** Arabic source content set inside a page that may be read left-to-right. */
const ARABIC = { lang: "ar", dir: "rtl" as const, style: { unicodeBidi: "isolate" as const } };

export default function ZenkiPage() {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("zenki");

  const badges = ["badgeUnits", "badgeAnnex", "badgeMode"];

  return (
    <div className="zk-page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        <div aria-hidden="true" className="vg-pattern" />
        <span aria-hidden="true" className="vg-rule" />
        <div id="zk-hero" style={{ ...SECTION, position: "relative", padding: "56px 24px 62px", display: "grid", gridTemplateColumns: "minmax(0,.92fr) minmax(0,1.08fr)", gap: 38, alignItems: "center" }}>
          <div style={{ display: "grid", gap: 16, justifyItems: "start" }}>
            <Link href={miaPath("courses", locale)} className="zk-back" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,.75)", fontSize: 13.5, fontWeight: 800 }}>
              <span aria-hidden="true">{rtl ? "→" : "←"}</span>
              {t("backCourses")}
            </Link>
            <h1 style={{ margin: 0, fontSize: "clamp(27px,3.2vw,46px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("heroTitle")}</h1>
            <p style={{ margin: 0, maxWidth: "52ch", fontSize: 15.5, lineHeight: 2, color: "rgba(255,255,255,.82)" }}>{t("heroLead")}</p>
            <div className="zk-badges" style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
              {badges.map((badge, index) => (
                <span
                  key={badge}
                  style={
                    index === 0
                      ? { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: "rgba(211,154,39,.14)", border: "1px solid rgba(211,154,39,.5)", color: "var(--gold)", fontSize: 13, fontWeight: 900 }
                      : { display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.22)", color: "#fff", fontSize: 13, fontWeight: 800 }
                  }
                >
                  {t(badge)}
                </span>
              ))}
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <span aria-hidden="true" style={{ position: "absolute", inset: -10, border: "1px solid rgba(211,154,39,.35)", borderRadius: 14, pointerEvents: "none" }} />
            <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", boxShadow: "0 26px 60px rgba(0,0,0,.45)" }}>
              {/* Not autoplayed and not muted: the handoff starts this film
                  muted on load and offers an "unmute" button over it. A course
                  page that begins playing at a reader is worse than one they
                  press play on. */}
              <iframe
                src={youtubeEmbed(INTRO_VIDEO)}
                title={t("heroTitle")}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── The programme, and the man ────────────────────────────────────── */}
      <section style={{ position: "relative", padding: "56px 0 0" }}>
        <div className="zk-2col" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)", gap: 26, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 14, padding: 26, background: "var(--deep)", borderRadius: 12 }}>
            <h2 style={{ ...H2, fontSize: "clamp(19px,2vw,25px)", color: "#fff" }}>{t("introTitle")}</h2>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 2, color: "rgba(255,255,255,.82)" }}>{t("introText1")}</p>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 2, color: "rgba(255,255,255,.82)" }}>{t("introText2")}</p>
          </div>
          <div style={{ display: "grid", gap: 14, padding: 26, background: "var(--sand)", border: "1px solid rgba(211,154,39,.45)", borderRadius: 12 }}>
            <h2 style={{ ...H2, fontSize: "clamp(19px,2vw,25px)" }}>{t("whoTitle")}</h2>
            <p {...ARABIC} style={{ ...ARABIC.style, margin: 0, fontSize: 14, lineHeight: 2, color: "var(--deep)" }}>
              {ZENKI_WHO_TEXT}
            </p>
          </div>
        </div>
      </section>

      {/* ── What was said of him, and why a minbar ────────────────────────── */}
      <section style={{ position: "relative", padding: "46px 0 0" }}>
        <div className="zk-2col" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,.9fr)", gap: 26, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 12, padding: "22px 24px", background: "#fff", border: "1px solid rgba(211,154,39,.45)", borderRadius: 12 }}>
            <b style={{ fontSize: 15, fontWeight: 900, color: "var(--red)" }}>{t("quotesTitle")}</b>
            {ZENKI_QUOTES.map((quote) => (
              <div key={quote.by} style={{ display: "grid", gap: 4, padding: "12px 14px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)", borderRadius: 6 }}>
                <span {...ARABIC} style={{ ...ARABIC.style, fontSize: 13.5, lineHeight: 1.95, fontWeight: 700 }}>
                  {quote.text}
                </span>
                <b {...ARABIC} style={{ ...ARABIC.style, fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>
                  — {quote.by}
                </b>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 14, padding: 26, background: "var(--sand)", border: "1px solid rgba(211,154,39,.45)", borderRadius: 12 }}>
            <h2 style={{ ...H2, fontSize: "clamp(19px,2vw,25px)" }}>{t("whyMinbarTitle")}</h2>
            <p {...ARABIC} style={{ ...ARABIC.style, margin: 0, fontSize: 14, lineHeight: 2, color: "var(--deep)" }}>
              {ZENKI_WHY_MINBAR_TEXT}
            </p>
          </div>
        </div>
      </section>

      {/* ── The concepts ──────────────────────────────────────────────────── */}
      <section style={{ position: "relative", padding: "46px 0 0" }}>
        <div style={{ ...SECTION, display: "grid", gap: 18 }}>
          <h2 style={H2}>{t("vocabTitle")}</h2>
          <p style={{ margin: 0, maxWidth: "70ch", fontSize: 15, lineHeight: 1.9, color: "var(--muted)" }}>{t("vocabIntro")}</p>
          <div id="zk-vocab" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {ZENKI_VOCAB.map((concept) => (
              <span
                key={concept}
                {...ARABIC}
                style={{ ...ARABIC.style, display: "inline-flex", alignItems: "center", padding: "10px 16px", borderRadius: 999, background: "#fff", border: "1px solid var(--border)", borderInlineStart: "3px solid var(--gold)", fontSize: 13.5, fontWeight: 800, color: "var(--deep)" }}
              >
                {concept}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── The sessions ──────────────────────────────────────────────────── */}
      <section style={{ position: "relative", padding: "46px 0 0" }}>
        <div style={{ ...SECTION, display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h2 style={H2}>{t("unitsTitle")}</h2>
            <p style={{ margin: 0, maxWidth: "70ch", fontSize: 15, lineHeight: 1.9, color: "var(--muted)" }}>{t("unitsIntro")}</p>
          </div>

          <div className="zk-units" style={{ display: "grid", gap: 14 }}>
            {ZENKI_UNITS.map((unit) => (
              <article key={unit.title} className="zk-unit" style={{ display: "grid", gap: 12, padding: "22px 24px", background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 10 }}>
                <header style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span {...ARABIC} style={{ ...ARABIC.style, flex: "0 0 auto", display: "grid", placeItems: "center", minWidth: 34, height: 34, padding: "0 10px", borderRadius: 8, background: "rgba(211,154,39,.14)", color: "var(--gold)", fontSize: 13.5, fontWeight: 900 }}>
                    {unit.n}
                  </span>
                  <b {...ARABIC} style={{ ...ARABIC.style, flex: "1 1 240px", fontSize: 17, lineHeight: 1.5, fontWeight: 900 }}>
                    {unit.title}
                  </b>
                  <span {...ARABIC} style={{ ...ARABIC.style, color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>
                    {unit.duration}
                  </span>
                </header>

                <SyllabusList label={t("topicsLabel")} items={unit.topics} />
                <SyllabusList label={t("goalsLabel")} items={unit.goals} />
                {unit.refs.length ? <SyllabusList label={t("refsUnitLabel")} items={unit.refs} muted /> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── The annex for preachers ───────────────────────────────────────── */}
      <section style={{ position: "relative", padding: "46px 0 0" }}>
        <div style={{ ...SECTION, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, padding: 26, background: "var(--deep)", borderRadius: 12 }}>
            <h2 style={{ ...H2, fontSize: "clamp(19px,2vw,25px)", color: "#fff" }}>{t("annexTitle")}</h2>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 2, color: "rgba(255,255,255,.82)" }}>{t("annexText")}</p>
            <span style={{ justifySelf: "start", padding: "6px 12px", borderRadius: 999, background: "rgba(211,154,39,.16)", border: "1px solid rgba(211,154,39,.45)", color: "var(--gold)", fontSize: 12.5, fontWeight: 900 }}>
              {t("annexDuration")}
            </span>
          </div>

          {ZENKI_ANNEX.map((part) => (
            <article key={part.title} className="zk-unit" style={{ display: "grid", gap: 12, padding: "22px 24px", background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--red)", borderRadius: 10 }}>
              {/* No number and no duration here: the two lectures share one,
                  stated once in the block above. */}
              <b {...ARABIC} style={{ ...ARABIC.style, fontSize: 17, lineHeight: 1.5, fontWeight: 900 }}>
                {part.title}
              </b>

              <SyllabusList label={t("topicsLabel")} items={part.topics} />
              <SyllabusList label={t("elementsLabel")} items={part.elements} />
              {part.refs.length ? <SyllabusList label={t("refsSessionLabel")} items={part.refs} muted /> : null}
            </article>
          ))}
        </div>
      </section>

      {/* ── How it is run ─────────────────────────────────────────────────── */}
      <section style={{ position: "relative", padding: "46px 0 60px" }}>
        <div style={{ ...SECTION, display: "grid", gap: 18 }}>
          <h2 style={H2}>{t("formatsTitle")}</h2>
          <div className="zk-formats" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
            {[
              { title: "formatRegularTitle", text: "formatRegularText" },
              { title: "formatIntensiveTitle", text: "formatIntensiveText" },
            ].map((format) => (
              <div key={format.title} style={{ display: "grid", gap: 8, padding: 24, background: "var(--sand)", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)", borderRadius: 10 }}>
                <b style={{ fontSize: 16.5, fontWeight: 900 }}>{t(format.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.9 }}>{t(format.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
    </div>
  );
}

/**
 * One labelled list inside a session card.
 *
 * The label is translated; the items are the Arabic syllabus, so the list
 * carries its own language and direction.
 */
function SyllabusList({ label, items, muted = false }: { label: string; items: readonly string[]; muted?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <b style={{ fontSize: 12, fontWeight: 900, color: "var(--gold)", letterSpacing: ".04em" }}>{label}</b>
      <ul {...ARABIC} style={{ ...ARABIC.style, margin: 0, paddingInlineStart: 18, display: "grid", gap: 5 }}>
        {items.map((item) => (
          <li key={item} style={{ fontSize: muted ? 12.5 : 13.5, lineHeight: 1.9, color: muted ? "var(--muted)" : "var(--deep)" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
