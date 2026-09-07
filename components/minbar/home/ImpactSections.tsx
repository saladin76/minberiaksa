"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import Rail from "@/components/minbar/Rail";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import { miaPath } from "@/lib/minbar/routes";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * "How your donation arrives", the impact figures, and the urgent-projects rail.
 * Ported from `Minbar/الصفحة الرئيسية.dc.html`.
 */

/* ── How it works ───────────────────────────────────────────────────────────
 * The step numbers are formatted for the locale (١٢٣ in Arabic and Urdu, 123
 * elsewhere) so a French or Swedish session does not show Arabic-Indic digits. */
export function PathSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const { formatNumber } = useMinbarMoney();

  const steps = [1, 2, 3, 4, 5].map((n) => ({
    num: formatNumber(n),
    title: t(`pathStep${n}Title`),
    text: t(`pathStep${n}Text`),
  }));

  return (
    <section id="path" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.11), rgba(247,242,234,.36))", padding: "56px 0", overflow: "hidden" }}>
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("howItWorksTitle")}</h2>
          <Button variant="light" href={miaPath("reports", locale)} style={{ whiteSpace: "nowrap" }}>
            {t("viewReports")}
          </Button>
        </div>
        <div id="path-steps" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}>
          {steps.map((step, i) => (
            <div
              key={step.title}
              style={{
                display: "grid",
                gap: 12,
                alignContent: "start",
                padding: "8px 26px 8px 0",
                background: "transparent",
                borderInlineEnd: i === steps.length - 1 ? "0" : "1px solid var(--border)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 34, fontWeight: 900, color: "var(--gold)", lineHeight: 1.15 }}>{step.num}</span>
                <span style={{ flex: "1 1 auto", height: 1, background: "var(--border)" }} />
              </span>
              <b style={{ fontSize: 20, lineHeight: 1.35 }}>{step.title}</b>
              <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8, maxWidth: "26ch" }}>{step.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Impact figures ─────────────────────────────────────────────────────────
 * The official totals from the foundation's achievements record; the labels come
 * from the translated `achievements` bundle. Figures are rendered `dir="ltr"`
 * and isolated so bidi cannot reorder a grouped number. */
const SECTORS = [
  { key: "secWaqf", projects: 37, beneficiaries: 436_529 },
  { key: "secHoly", projects: 201, beneficiaries: 1_208_675 },
  { key: "secEdu", projects: 380, beneficiaries: 369_371 },
  { key: "secSocial", projects: 146, beneficiaries: 369_931 },
  { key: "secEcon", projects: 145, beneficiaries: 331_850 },
  { key: "secHealth", projects: 27, beneficiaries: 309_732 },
] as const;

export function ImpactSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tAch = useTranslations("achievements");
  const { formatNumber } = useMinbarMoney();

  const metrics = [
    { value: formatNumber(936), label: tAch("bigProjects"), note: tAch("yearsTitle"), color: "var(--gold)" },
    { value: formatNumber(3_026_088), label: tAch("bigServices"), note: tAch("noteServices"), color: "var(--deep)" },
    {
      value: formatNumber(6),
      label: tAch("sectorsLabel"),
      note: SECTORS.map((s) => tAch(s.key)).join(" · "),
      color: "var(--deep)",
    },
  ];

  return (
    <section id="stats" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.16), rgba(247,242,234,.46))", padding: "56px 0", borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginBottom: 30 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("ourImpact")}</h2>
          <Button variant="light" href={miaPath("reports", locale)} style={{ whiteSpace: "nowrap" }}>
            {t("reportsPage")}
          </Button>
        </div>

        <div id="impact-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", borderTop: "1px solid var(--border)" }}>
          {metrics.map((metric, i) => (
            <div
              key={metric.label}
              style={{
                display: "grid",
                gap: 10,
                padding: "34px 28px 34px 0",
                alignContent: "start",
                justifyItems: "start",
                borderInlineEnd: i === metrics.length - 1 ? "0" : "1px solid var(--border)",
              }}
            >
              <b dir="ltr" style={{ justifySelf: "start", fontSize: "clamp(34px,3.4vw,48px)", lineHeight: 1.1, fontWeight: 900, letterSpacing: "-.02em", unicodeBidi: "isolate", color: metric.color }}>
                {metric.value}
              </b>
              <span style={{ color: "var(--deep)", fontSize: 15, fontWeight: 800, lineHeight: 1.5 }}>{metric.label}</span>
              <span style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>{metric.note}</span>
            </div>
          ))}
        </div>

        <div id="sector-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginTop: 34 }}>
          {SECTORS.map((sector) => (
            <div key={sector.key} style={{ display: "grid", gap: 5, alignContent: "start", padding: "18px 20px", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 10px 30px rgba(16,33,43,.06)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 900, color: "#8a5d16" }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                {tAch(sector.key)}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <b dir="ltr" style={{ fontSize: "clamp(22px,2vw,30px)", lineHeight: 1.15, fontWeight: 900, letterSpacing: "-.02em", color: "var(--deep)", unicodeBidi: "isolate" }}>
                  {formatNumber(sector.beneficiaries)}
                </b>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>{tAch("unitBeneficiaries")}</span>
              </span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                <b dir="ltr" style={{ unicodeBidi: "isolate", color: "var(--deep)" }}>
                  {formatNumber(sector.projects)}
                </b>{" "}
                {tAch("unitProjects")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Urgent projects ────────────────────────────────────────────────────────
 * Live from the campaigns CMS. The section is omitted entirely when there is
 * nothing to show rather than rendering an empty rail. */
export function UrgentProjectsSection({ projects }: { projects: MinbarProject[] }) {
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");

  if (!projects.length) return null;

  return (
    <section id="urgent" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.20), rgba(247,242,234,.50))", padding: "56px 0 0", overflow: "hidden" }}>
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <Rail
          id="urgent-rail"
          step={348}
          prevLabel={tCommon("prev")}
          nextLabel={tCommon("next")}
          heading={<h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("urgentProjects")}</h2>}
        >
          {projects.map((project) => (
            <ProjectDonateCard key={project.slug} project={project} width={340} />
          ))}
        </Rail>
      </div>
    </section>
  );
}

/* ── Region cards ───────────────────────────────────────────────────────────
 * Three doors into the work: Al-Quds, Al-Aqsa, and emergency relief. */
export function RegionCards({ images }: { images: { quds: string; aqsa: string; relief: string } }) {
  const locale = useLocale();
  const t = useTranslations("homepage");

  const cards = [
    {
      title: t("qudsProjectsTitle"),
      cta: t("qudsProjectsTitle"),
      text: t("qudsProjectsText"),
      href: miaPath("projects", locale),
      image: images.quds,
      overlay: "linear-gradient(-90deg, rgba(16,33,43,.9) 8%, rgba(16,33,43,.45) 70%, rgba(16,33,43,.25))",
      ctaBackground: "var(--gold)",
      ctaColor: "var(--deep)",
    },
    {
      title: t("aqsaProjectsTitle"),
      cta: t("aqsaProjectsCta"),
      text: t("aqsaProjectsText"),
      href: miaPath("aqsa", locale),
      image: images.aqsa,
      overlay: "linear-gradient(-90deg, rgba(16,33,43,.9) 8%, rgba(16,33,43,.45) 70%, rgba(16,33,43,.25))",
      ctaBackground: "var(--deep)",
      ctaColor: "#fff",
    },
    {
      title: t("urgentProjectsTitle"),
      cta: t("urgentProjectsCta"),
      text: t("urgentProjectsText"),
      href: miaPath("projects", locale),
      image: images.relief,
      overlay: "linear-gradient(-90deg, rgba(76,22,14,.92) 8%, rgba(76,22,14,.5) 70%, rgba(16,33,43,.3))",
      ctaBackground: "var(--red)",
      ctaColor: "#fff",
    },
  ];

  return (
    <section style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.36), rgba(247,242,234,.64))", padding: "56px 0 0" }}>
      <div id="regions" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
        {cards.map((card) => (
          <Link key={card.title} href={card.href} style={{ position: "relative", display: "block", minHeight: 260, overflow: "hidden", background: "var(--deep)" }}>
            <span role="img" aria-label={card.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${card.image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <span style={{ position: "absolute", inset: 0, background: card.overlay }} />
            <span style={{ position: "relative", display: "grid", gap: 12, justifyItems: "start", padding: 32 }}>
              <b style={{ color: "#fff", fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 900, lineHeight: 1.25 }}>{card.title}</b>
              <span style={{ color: "rgba(255,255,255,.82)", fontSize: 15, lineHeight: 1.8, maxWidth: "44ch" }}>{card.text}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 20px", background: card.ctaBackground, color: card.ctaColor, fontWeight: 800, fontSize: 15, borderRadius: 8 }}>
                {card.cta}
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
                  <path d="M14 6l-6 6 6 6" />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
