"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import type { MinbarProject } from "@/lib/minbar/projects";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import { NoResults } from "@/components/minbar/states/ContentStates";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import CategoryIcon, { type CategoryIconName } from "./CategoryIcons";
import ProjectsHero, { type ProjectSlide } from "./ProjectsHero";

/**
 * Projects catalogue — ported from `Minbar/المشاريع.dc.html`.
 *
 * A hero carousel, a row of category filter chips, and a responsive grid of the
 * site's project card with "load more" paging.
 *
 * Filters compare category **ids**, never displayed labels: comparing labels
 * detaches the filter from its state the moment the labels are translated (the
 * same trap the handoff calls out for the FAQ and frequency chips).
 *
 * The chip set is driven by the categories that actually exist in the CMS, so a
 * category with no published projects does not appear as a filter that returns
 * nothing.
 */

const PAGE_SIZE = 6;

/**
 * Icons and label sources for the categories the design ships. A category slug
 * outside this map still gets a chip — it falls back to the grid glyph and its
 * own CMS name — so adding a category in the dashboard does not require a
 * code change.
 */
const CATEGORY_PRESETS: Record<string, { icon: CategoryIconName; ns: string; key: string }> = {
  "al-quds": { icon: "landmark", ns: "homepage", key: "regionQuds" },
  gaza: { icon: "hand-heart", ns: "homepage", key: "storyGaza" },
  "al-aqsa": { icon: "moon-star", ns: "homepage", key: "regionAqsa" },
  urgent: { icon: "siren", ns: "projects", key: "catUrgent" },
  zakat: { icon: "hand-coins", ns: "navigation", key: "zakat" },
  waqf: { icon: "scroll-text", ns: "navigation", key: "waqf" },
  ibadan: { icon: "book-open-check", ns: "navigation", key: "ibadanProject" },
  education: { icon: "graduation-cap", ns: "projects", key: "catEduQuds" },
  repair: { icon: "home", ns: "projects", key: "catHomeRepair" },
  ramadan: { icon: "calendar-heart", ns: "projects", key: "catRamadan" },
  qurbani: { icon: "beef", ns: "projects", key: "catQurbani" },
  africa: { icon: "globe", ns: "projects", key: "catAfrica" },
};

export interface ProjectsPageProps {
  projects: MinbarProject[];
  slides: ProjectSlide[];
}

export default function ProjectsPage({ projects, slides }: ProjectsPageProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tSystem = useTranslations("system");

  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const label = (ns: string, key: string) =>
    ns === "system" ? tSystem(key)
      : ns === "navigation" ? tNav(key)
        : ns === "homepage" ? tHome(key)
          : t(key);

  /** Every category that has at least one published project, in project order. */
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const project of projects) {
      if (project.region && !seen.has(project.region)) {
        seen.set(project.region, project.regionLabel ?? project.region);
      }
    }
    return [
      { id: "all", icon: "layout-grid" as CategoryIconName, label: tSystem("allFilter") },
      ...[...seen.entries()].map(([slug, name]) => {
        const preset = CATEGORY_PRESETS[slug];
        return {
          id: slug,
          icon: preset?.icon ?? ("layout-grid" as CategoryIconName),
          // A preset label is the glossary-approved translation; otherwise the
          // CMS name, which is already per-locale.
          label: preset ? label(preset.ns, preset.key) : name,
        };
      }),
    ];
    // `label` closes over the translators, which are stable for a locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, locale]);

  const filtered = useMemo(
    () => (category === "all" ? projects : projects.filter((p) => p.region === category)),
    [projects, category]
  );

  const visible = filtered.slice(0, limit);
  const remaining = Math.max(0, filtered.length - limit);

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
          opacity: 0.085,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <img
        src="/minbar/assets/aqsa-dome-line.png"
        alt=""
        aria-hidden="true"
        style={{ position: "fixed", left: "50%", top: "74%", transform: "translate(-50%,-50%)", width: "62vw", maxWidth: 900, height: "auto", opacity: 0.1, pointerEvents: "none", zIndex: 0 }}
      />

      <ProjectsHero slides={slides} />

      <section style={{ position: "relative", background: "var(--ivory)", overflow: "hidden" }}>
        <div
          aria-hidden="true"
          data-aqsa-pattern=""
          style={{ position: "absolute", inset: 0, backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')", backgroundRepeat: "repeat", backgroundSize: "520px 520px", opacity: 0.05, pointerEvents: "none" }}
        />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "30px 24px 34px", display: "grid", gap: 18 }}>
          <div className="mia-rail" id="proj-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", paddingBottom: 4 }}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                data-cat={category === c.id ? "1" : ""}
                onClick={() => {
                  setCategory(c.id);
                  setLimit(PAGE_SIZE);
                }}
                className="proj-cat"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 40,
                  padding: "0 16px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  transition: "all .18s ease",
                  border: "1px solid var(--border)",
                  background: "#fff",
                  color: "var(--muted)",
                }}
              >
                <span style={{ display: "inline-flex", width: 15, height: 15 }}>
                  <CategoryIcon name={c.icon} />
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="all" style={{ position: "relative", background: "transparent", padding: "46px 0 66px", overflow: "hidden" }}>
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 24 }}>
          {visible.length ? (
            <div className="proj-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 22, justifyContent: "center" }}>
              {visible.map((project) => (
                <ProjectDonateCard key={project.slug} project={project} />
              ))}
            </div>
          ) : (
            /* The approved empty state, and the right one of the three: a
               reader who filtered their way here needs the filters cleared,
               not a link somewhere else. */
            <NoResults onReset={() => setCategory("all")} />
          )}

          {remaining > 0 ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 26 }}>
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="proj-more"
                style={{ height: 50, padding: "0 30px", borderRadius: 999, border: "1px solid var(--border)", background: "#fff", color: "var(--deep)", fontFamily: "inherit", fontSize: 15, fontWeight: 900, cursor: "pointer", transition: "all .18s ease" }}
              >
                {tCommon("loadMore", { count: remaining })}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
