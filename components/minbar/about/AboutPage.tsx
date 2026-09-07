"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import { ORG } from "@/lib/minbar/org";
import { Button } from "@/components/minbar/ds";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";

/**
 * About us — ported from `Minbar/من نحن.dc.html`.
 *
 * The one page on the site that states who the foundation legally is, so the
 * licence number, address and phone come from `lib/minbar/org.ts` rather than
 * being retyped: the Footer prints the same three facts, and two copies drift.
 *
 * Content order matches the handoff exactly — mission and method side by side,
 * then vision beside the five objectives, then the four departments, the four
 * areas of work, the legal status, and a closing call.
 */

/** Objective keys, in the order the handoff lists them. */
const OBJECTIVES = ["objective1", "objective2", "objective3", "objective4", "objective5"] as const;

/**
 * The four departments. Each carries only the points it actually has — the
 * finance department has one, and padding it out to match the others would be
 * inventing work the foundation does not claim.
 */
const DEPARTMENTS: ReadonlyArray<{ title: string; points: readonly string[] }> = [
  { title: "dept1Title", points: ["dept1P1", "dept1P2", "dept1P3", "dept1P4"] },
  { title: "dept2Title", points: ["dept2P1", "dept2P2", "dept2P3"] },
  { title: "dept3Title", points: ["dept3P1"] },
  { title: "dept4Title", points: ["dept4P1", "dept4P2", "dept4P3"] },
];

/** The four areas of work, as title/body key pairs. */
const PILLARS: ReadonlyArray<{ title: string; text: string }> = [
  { title: "pillar1Title", text: "pillar1Text" },
  { title: "pillar2Title", text: "pillar2Text" },
  { title: "pillar3Title", text: "pillar3Text" },
  { title: "pillar4Title", text: "pillar4Text" },
];

/** A small gold diamond — the handoff's list marker throughout this page. */
function Diamond({ size = 6, top = 8 }: { size?: number; top?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ flex: "0 0 auto", marginTop: top, width: size, height: size, background: "var(--gold)", transform: "rotate(45deg)" }}
    />
  );
}

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;
const H2 = { margin: 0, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.3, fontWeight: 900 } as const;

export default function AboutPage() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("about");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");

  /* The hero gradient deepens away from the reader, so it flips with the
     writing direction rather than always pointing left. */
  const heroGradient = `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  return (
    <div className="ab-page">
      <section id="hero" style={{ position: "relative", background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "70px 24px", display: "grid", gap: 16, justifyItems: "start" }}>
          <h1 className="ab-in" style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {t("heroTitle")}
          </h1>
          <div className="ab-in ab-in-1" style={{ width: 90, height: 2, background: "#fff", opacity: 0.75 }} />
          <p className="ab-in ab-in-2" style={{ margin: 0, maxWidth: "62ch", fontSize: 17, lineHeight: 1.9, color: "rgba(255,255,255,.92)" }}>
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "64px 0" }}>
        <div className="ab-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 46, alignItems: "start" }}>
          <div className="ab-in" style={{ display: "grid", gap: 16 }}>
            <h2 style={H2}>{t("sectionMission")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.95, color: "var(--muted)" }}>{t("mission")}</p>
          </div>
          <div className="ab-in ab-in-1" style={{ display: "grid", gap: 16 }}>
            <h2 style={H2}>{t("sectionHowWeWork")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.95, color: "var(--muted)" }}>{t("howWeWork")}</p>
          </div>
        </div>
      </section>

      <section style={{ background: "var(--sand)", borderBottom: "1px solid var(--border)", padding: "64px 0" }}>
        <div className="ab-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,.85fr) minmax(0,1.15fr)", gap: 46, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <h2 style={H2}>{t("sectionVision")}</h2>
            <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.9, color: "var(--deep)", fontWeight: 700 }}>{t("vision")}</p>
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.9, color: "var(--muted)" }}>{t("visionDetail")}</p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <h2 style={{ ...H2, margin: "0 0 4px", fontSize: "clamp(22px,2.3vw,30px)" }}>{t("sectionObjectives")}</h2>
            {OBJECTIVES.map((key) => (
              <div
                key={key}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "#fff", border: "1px solid var(--border)", borderInlineStart: "3px solid var(--gold)" }}
              >
                <Diamond />
                <span style={{ fontSize: 14.5, lineHeight: 1.85, color: "var(--deep)" }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "64px 0" }}>
        <div style={SECTION}>
          <h2 style={{ ...H2, margin: "0 0 26px" }}>{t("sectionDepartments")}</h2>
          <div className="ab-grid4">
            {DEPARTMENTS.map((dept) => (
              <div
                key={dept.title}
                className="ab-card"
                style={{ display: "grid", gap: 10, alignContent: "start", padding: 22, background: "var(--sand)", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)" }}
              >
                <b style={{ fontSize: 17, lineHeight: 1.4 }}>{t(dept.title)}</b>
                <div style={{ display: "grid", gap: 6 }}>
                  {dept.points.map((point) => (
                    <div key={point} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <Diamond size={5} top={7} />
                      <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(point)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "var(--sand)", borderBottom: "1px solid var(--border)", padding: "64px 0" }}>
        <div style={SECTION}>
          <h2 style={{ ...H2, margin: "0 0 26px" }}>{t("sectionPillars")}</h2>
          <div className="ab-grid4">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="ab-card"
                style={{ display: "grid", gap: 8, alignContent: "start", padding: 22, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--gold)" }}
              >
                <b style={{ fontSize: 17, lineHeight: 1.4 }}>{t(pillar.title)}</b>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.85 }}>{t(pillar.text)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "64px 0" }}>
        <div className="ab-two" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 46, alignItems: "center" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <h2 style={H2}>{t("sectionLegal")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.95, color: "var(--muted)" }}>{t("legalText")}</p>
            <div style={{ display: "grid", gap: 6, padding: "18px 20px", background: "var(--sand)", border: "1px solid rgba(211,154,39,.5)", borderInlineStart: "3px solid var(--gold)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 900, color: "var(--gold)", letterSpacing: ".05em" }}>{t("licenseNumberLabel")}</span>
              {/* A licence number is Latin digits and a slash: isolated so an
                  RTL paragraph cannot reorder it into a different number. */}
              <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block", fontSize: 16, fontWeight: 900 }}>
                {ORG.licenseNumber}
              </span>
              <span style={{ fontSize: 14, color: "var(--muted)" }}>{t("licenseDate")}</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12, padding: "22px 24px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)" }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: "var(--gold)", letterSpacing: ".04em" }}>{t("addressLabel")}</span>
            <span style={{ fontSize: 15, lineHeight: 1.8 }}>{ORG.address}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: "var(--gold)", letterSpacing: ".04em", marginTop: 8 }}>{t("contactLabel")}</span>
            <span style={{ fontSize: 15, lineHeight: 1.8 }}>
              {ORG.email}
              <br />
              <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>{ORG.phone}</span>
            </span>
          </div>
        </div>
      </section>

      <section style={{ position: "relative", background: "var(--deep)", padding: "56px 0", overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-cta-pattern" />
        <div style={{ ...SECTION, position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <h2 className="ab-in" style={{ margin: 0, fontSize: "clamp(24px,2.6vw,32px)", fontWeight: 900, color: "#fff" }}>
            {t("ctaTagline")}
          </h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {tCommon("donate")}
            </Button>
            <Button variant="outline" href={miaPath("contact", locale)} style={{ whiteSpace: "nowrap" }}>
              {tNav("contact")}
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
