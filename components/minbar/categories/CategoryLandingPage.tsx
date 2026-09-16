"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { ArrowGlyph } from "@/components/minbar/home/TopSections";
import type { CategoryPageContent } from "@/lib/minbar/category-page";
import {
  CategoryAchievements,
  CategoryDonateBox,
  CategoryHeroFilm,
  CategoryInfoCards,
  CategoryProjectsGrid,
  CategoryStatsBand,
  CategoryValuesStrip,
} from "./CategorySections";

/**
 * A category's landing page — ported from
 * `Minbar/مشروع ترميم منازل القدس.dc.html`.
 *
 * Every category is published this way: a hero with the programme's film, a
 * navy band of figures over a progress bar, the values it stands on, its
 * campaigns as the site's own donate cards, a donation box scoped to the
 * category, three explanatory cards, and its achievements in video.
 *
 * Nothing here is hard-coded: `lib/minbar/category-page.ts` resolves every
 * string for the visitor's locale, and each section is skipped when its data is
 * empty — so a category with only a name still renders as a hero and its
 * campaigns rather than as a page of blank frames. The sections themselves live
 * in `CategorySections`, because a category bound to one of the site's own
 * pages (the mosque, zakat) shows the same parts inside that page instead.
 */

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export default function CategoryLandingPage({ page }: { page: CategoryPageContent }) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const t = useTranslations("common");
  const tCampaigns = useTranslations("CampaignsPage");

  return (
    <div className="cat-page">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
        {page.heroImage ? (
          /* eslint-disable-next-line @next/next/no-img-element -- fills the section; not a fixed-size image */
          <img
            src={page.heroImage}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to ${rtl ? "left" : "right"}, rgba(16,33,43,.35) 0%, rgba(16,33,43,.15) 38%, transparent 62%)`,
            pointerEvents: "none",
          }}
        />
        <div
          className="cat-hero"
          style={{
            ...SECTION,
            position: "relative",
            padding: "140px 24px 110px",
            display: "grid",
            gridTemplateColumns: page.heroVideoId ? "minmax(0,1.05fr) minmax(0,.95fr)" : "minmax(0,1fr)",
            gap: 44,
            alignItems: "end",
          }}
        >
          <div
            className="cat-hero-box"
            /* Without a film beside it the box would stretch the full width and the
               lead would run to 120 characters; it is sized to its content instead. */
            style={{ display: "grid", gap: 18, justifyItems: "start", justifySelf: "start", maxWidth: page.heroVideoId ? "none" : "min(100%, 720px)", padding: "26px 28px", background: "rgba(16,33,43,.55)", borderRadius: 14, backdropFilter: "blur(2px)" }}
          >
            <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{page.name}</h1>
            {page.heroLead ? (
              <p style={{ margin: 0, maxWidth: "58ch", fontSize: 16.5, lineHeight: 1.95, color: "rgba(255,255,255,.9)" }}>{page.heroLead}</p>
            ) : null}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="#category-projects"
                className="cat-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,.5)", color: "#fff", fontWeight: 800, fontSize: 15.5 }}
              >
                {page.ctaLabel || page.projectsTitle || tCampaigns("allCampaigns")}
                <ArrowGlyph size={14} />
              </a>
              <a
                href="#category-donate"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 24px", borderRadius: 10, background: "var(--red)", border: "1px solid var(--red)", color: "#fff", fontWeight: 900, fontSize: 15.5 }}
              >
                {t("donateNow")}
              </a>
            </div>
          </div>

          <CategoryHeroFilm page={page} />
        </div>
      </section>

      {/* ── The figures ────────────────────────────────────────────────── */}
      {page.stats ? (
        <section style={{ position: "relative", zIndex: 1 }}>
          <CategoryStatsBand stats={page.stats} />
        </section>
      ) : null}

      {/* ── The values, then the campaigns ─────────────────────────────── */}
      <section id="category-projects" style={{ position: "relative", zIndex: 1, background: "var(--sand)", padding: "46px 0 52px", overflow: "hidden" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px", display: "grid", gap: 20 }}>
          <CategoryValuesStrip values={page.values} />

          {page.projectsTitle ? (
            <h2 style={{ margin: "6px 0 0", fontSize: "clamp(21px,2vw,27px)", lineHeight: 1.3, fontWeight: 900 }}>{page.projectsTitle}</h2>
          ) : null}

          <CategoryProjectsGrid page={page} />
        </div>
      </section>

      {/* ── The donation box ───────────────────────────────────────────── */}
      {page.donateTarget ? (
        <section id="category-donate" style={{ position: "relative", zIndex: 1, background: "var(--ivory)", padding: "44px 0 56px", overflow: "hidden" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
            <CategoryDonateBox page={page} />
          </div>
        </section>
      ) : null}

      {/* ── Why / what / impact ────────────────────────────────────────── */}
      {page.cards.length ? (
        <section style={{ position: "relative", zIndex: 1, padding: "60px 0 24px" }}>
          <div style={SECTION}>
            <CategoryInfoCards cards={page.cards} />
          </div>
        </section>
      ) : null}

      {/* ── Achievements in video ──────────────────────────────────────── */}
      {page.achievements.length ? (
        <section style={{ position: "relative", zIndex: 1, padding: "34px 0 56px" }}>
          <div style={SECTION}>
            <CategoryAchievements page={page} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
