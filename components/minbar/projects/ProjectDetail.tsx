"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import type { MinbarProject, MinbarProjectUpdate } from "@/lib/minbar/projects";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import { ArrowGlyph } from "@/components/minbar/home/TopSections";
import DonationPanel from "./DonationPanel";

/**
 * Project detail — ported from `Minbar/تفاصيل مشروع.dc.html`.
 *
 * Breadcrumb, hero, the sticky donation panel, a tabbed body (about / field
 * updates / gallery), a project FAQ with zakat and waqf cross-links, and
 * related projects.
 *
 * The Updates and Gallery tabs only appear when there is something in them.
 * The handoff is firm that reports and photographs are shown once approved and
 * linked to the project — an empty tab implies content that does not exist.
 */

export interface ProjectDetailProps {
  project: MinbarProject;
  updates: MinbarProjectUpdate[];
  gallery: string[];
  related: MinbarProject[];
}

export default function ProjectDetail({ project, updates, gallery, related }: ProjectDetailProps) {
  const locale = useLocale();
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("navigation");
  const tHome = useTranslations("homepage");

  const tabs = [
    { id: "about", label: t("tabAbout"), available: true },
    { id: "updates", label: t("tabUpdates"), available: updates.length > 0 },
    { id: "gallery", label: t("tabField"), available: gallery.length > 0 },
  ].filter((tab) => tab.available);

  const [tab, setTab] = useState("about");

  const dateFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden="true"
        data-aqsa-pattern=""
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
          backgroundRepeat: "repeat",
          backgroundSize: "620px 620px",
          opacity: 0.075,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <img
        src="/minbar/assets/aqsa-dome-line.png"
        alt=""
        aria-hidden="true"
        style={{ position: "fixed", left: "50%", top: "76%", transform: "translate(-50%,-50%)", width: "58vw", maxWidth: 860, height: "auto", opacity: 0.1, pointerEvents: "none", zIndex: 0 }}
      />

      {/* Breadcrumb — `PRODUCTION_SEO_CONTRACT.md` asks for BreadcrumbList
          structured data on detail pages; it is emitted by the route. */}
      <nav aria-label={tNav("home")} style={{ position: "relative", zIndex: 1, background: "rgba(255,255,255,.86)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "11px 24px", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 700, color: "var(--muted)", flexWrap: "wrap" }}>
          <Link href={miaPath("home", locale)}>{tNav("home")}</Link>
          <span aria-hidden="true" style={{ color: "var(--gold)" }}>
            <ArrowGlyph size={11} />
          </span>
          <Link href={miaPath("projects", locale)}>{tNav("projects")}</Link>
          <span aria-hidden="true" style={{ color: "var(--gold)" }}>
            <ArrowGlyph size={11} />
          </span>
          <span style={{ color: "var(--deep)" }}>{project.title}</span>
        </div>
      </nav>

      <section style={{ position: "relative", zIndex: 1, padding: "34px 0 40px", overflow: "hidden" }}>
        <svg viewBox="0 0 220 220" aria-hidden="true" style={{ position: "absolute", insetInlineEnd: -40, top: -30, width: 220, height: 220, opacity: 0.06, pointerEvents: "none" }}>
          <path d="M110 220V140a70 70 0 0 1 70-70h40" fill="none" stroke="var(--gold)" strokeWidth="2" />
          <circle cx="180" cy="70" r="5" fill="var(--gold)" />
        </svg>

        <div id="pd-top" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1.32fr) minmax(330px,.68fr)", gap: 34, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
            <span style={{ position: "relative", display: "block", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "var(--sand)", border: "1px solid var(--border)" }}>
              {project.image ? (
                <span role="img" aria-label={project.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${project.image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
              ) : null}
              <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.6), rgba(16,33,43,0) 52%)" }} />
              {project.regionLabel ? (
                <span style={{ position: "absolute", insetInlineStart: 16, top: 16, display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999, background: "rgba(16,33,43,.78)", color: "#fff", fontSize: 12, fontWeight: 900 }}>
                  <span aria-hidden="true" style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                  {project.regionLabel}
                </span>
              ) : null}
            </span>

            <div style={{ display: "grid", gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: "clamp(27px,3vw,40px)", lineHeight: 1.32, fontWeight: 900, letterSpacing: "-.01em" }}>{project.title}</h1>
              <p style={{ margin: 0, maxWidth: "66ch", fontSize: 16.5, lineHeight: 1.95, color: "var(--muted)" }}>{project.text}</p>
            </div>
          </div>

          <DonationPanel project={project} />
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "48px 0 8px" }}>
        <div id="pd-body" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1.32fr) minmax(300px,.68fr)", gap: 34, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 22, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-tab={tab === item.id ? "1" : ""}
                  onClick={() => setTab(item.id)}
                  className="pd-tab"
                  style={{ height: 46, padding: "0 17px", border: 0, borderBottom: "3px solid transparent", background: "transparent", color: "var(--muted)", fontFamily: "inherit", fontSize: 15, fontWeight: 900, cursor: "pointer", transition: "all .18s ease" }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "about" ? (
              <div style={{ display: "grid", gap: 20 }}>
                <p style={{ margin: 0, fontSize: 16.5, lineHeight: 2, color: "var(--muted)" }}>{project.text}</p>
                {/* Two standing paragraphs the handoff shows on every project:
                    how the work is executed, and how it is verified. */}
                <p style={{ margin: 0, fontSize: 16.5, lineHeight: 2, color: "var(--muted)" }}>{t("execParagraph")}</p>
                <p style={{ margin: 0, fontSize: 16.5, lineHeight: 2, color: "var(--muted)" }}>{t("verifyParagraph")}</p>
              </div>
            ) : null}

            {tab === "updates" ? (
              <div style={{ display: "grid", gap: 0 }}>
                {updates.map((update) => (
                  <div key={update.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 18, paddingBottom: 26 }}>
                    <span style={{ display: "grid", justifyItems: "center", gap: 6 }}>
                      <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 0 4px rgba(211,154,39,.2)" }} />
                      <span aria-hidden="true" style={{ width: 1, flex: "1 1 auto", minHeight: 42, background: "var(--border)" }} />
                    </span>
                    <span style={{ display: "grid", gap: 7, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: "#8a5d16" }}>
                        {dateFormatter.format(new Date(update.createdAt))}
                      </span>
                      <b style={{ fontSize: 16.5, lineHeight: 1.5 }}>{update.title}</b>
                      <span style={{ fontSize: 14.5, lineHeight: 1.9, color: "var(--muted)" }}>{update.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "gallery" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 12 }}>
                {gallery.map((src, i) => (
                  <span
                    key={src}
                    role="img"
                    aria-label={`${project.title} — ${i + 1}`}
                    style={{ display: "block", aspectRatio: "4/3", borderRadius: 10, backgroundImage: `url('${src}')`, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--border)" }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start", minWidth: 0 }}>
            <div style={{ display: "grid", gap: 12, padding: 22, background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}>
              <b style={{ fontSize: 15.5 }}>{t("projectFaq")}</b>
              {[
                { q: t("faqZakatQ"), a: t("faqZakatYes") },
                { q: t("faqTrackQ"), a: t("faqTrackA") },
                { q: t("faqRecurringQ"), a: t("faqRecurringA") },
              ].map((faq) => (
                <span key={faq.q} style={{ display: "grid", gap: 5, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <b style={{ fontSize: 14, lineHeight: 1.6 }}>{faq.q}</b>
                  <span style={{ fontSize: 13.5, lineHeight: 1.85, color: "var(--muted)" }}>{faq.a}</span>
                </span>
              ))}
            </div>

            <Link href={miaPath("zakat", locale)} className="pd-cross pd-cross--zakat" style={{ display: "grid", gap: 7, padding: "20px 22px", borderRadius: 12, background: "linear-gradient(to left, #14603C, #1F7A4D)", color: "#fff" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 900, letterSpacing: ".06em", color: "#C9EAD6" }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                {tNav("zakat")}
              </span>
              <b style={{ color: "#fff", fontSize: 17, lineHeight: 1.5 }}>{tHome("zakatBannerTitle")}</b>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, color: "#F2D9A4" }}>
                {tCommon("zakatToPalestine")}
                <ArrowGlyph />
              </span>
            </Link>

            <Link href={miaPath("waqf", locale)} style={{ display: "grid", gap: 7, padding: "20px 22px", borderRadius: 12, background: "var(--sand)", border: "1px solid rgba(211,154,39,.5)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 900, letterSpacing: ".06em", color: "#8a5d16" }}>
                <span aria-hidden="true" style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                {tNav("waqf")}
              </span>
              <b style={{ fontSize: 17, lineHeight: 1.5 }}>{tHome("waqfTitle")}</b>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, color: "var(--red)" }}>
                {tCommon("contributeWaqf")}
                <ArrowGlyph />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {related.length ? (
        <section style={{ position: "relative", zIndex: 1, padding: "42px 0 56px" }}>
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "clamp(22px,2.3vw,30px)", fontWeight: 900 }}>{t("relatedProjects")}</h2>
              <Link href={miaPath("projects", locale)} style={{ fontSize: 14, fontWeight: 800, color: "var(--red)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {t("allProjects")}
                <ArrowGlyph />
              </Link>
            </div>
            <div id="pd-related" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={miaPath("projectDetail", locale, item.slug)}
                  className="mia-lift"
                  style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 260, borderRadius: 14, overflow: "hidden", background: "var(--deep)", border: "1px solid var(--border)" }}
                >
                  {item.image ? (
                    <span role="img" aria-label={item.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${item.image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  ) : null}
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.95) 28%, rgba(16,33,43,.2) 74%)" }} />
                  <span style={{ position: "relative", marginTop: "auto", display: "grid", gap: 7, padding: 18 }}>
                    {item.regionLabel ? <span style={{ fontSize: 11.5, fontWeight: 900, color: "#F2D9A4" }}>{item.regionLabel}</span> : null}
                    <b style={{ color: "#fff", fontSize: 17, lineHeight: 1.45 }}>{item.title}</b>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
