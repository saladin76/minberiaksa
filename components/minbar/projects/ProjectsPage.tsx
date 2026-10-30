"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { ProjectFilterOption } from "@/lib/minbar/project-filter-options";
import type { MinbarProject } from "@/lib/minbar/projects";
import ProjectDonateCard from "@/components/minbar/ProjectDonateCard";
import { NoResults } from "@/components/minbar/states/ContentStates";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import CategoryIcon from "./CategoryIcons";
import ProjectsHero, { type ProjectSlide } from "./ProjectsHero";

/**
 * Projects catalogue  ported from `Minbar/المشاريع.dc.html`.
 *
 * A hero carousel, a row of category filter chips, and a responsive grid of the
 * site's project card that grows as the reader scrolls: a sentinel below the
 * grid appends the next page when it comes within a screen of the viewport,
 * so the catalogue reads as one continuous list. A "load more" button stays
 * under the grid for whoever the observer does not reach  a keyboard user
 * tabbing past the cards, a browser without IntersectionObserver  and is the
 * accessible name of what the scroll is doing.
 *
 * Filters compare category **ids**, never displayed labels: comparing labels
 * detaches the filter from its state the moment the labels are translated (the
 * same trap the handoff calls out for the FAQ and frequency chips).
 *
 * Regional chips filter the published pool. Giving programmes link to their
 * locale's dedicated page; they must not look like empty category filters.
 */

const PAGE_SIZE = 6;

export interface ProjectsPageProps {
  projects: MinbarProject[];
  slides: ProjectSlide[];
  filters: ProjectFilterOption[];
}

export default function ProjectsPage({ projects, slides, filters }: ProjectsPageProps) {
  const tCommon = useTranslations("common");
  const tSystem = useTranslations("system");

  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const categories: ProjectFilterOption[] = useMemo(() => [{ key: "all", id: "all", kind: "category", slug: "all", order: -1, name: tSystem("allFilter"), icon: "layout-grid", projectIds: projects.map(project => project.id) }, ...filters], [filters, projects, tSystem]);
  useEffect(() => {
    let hash: string; try { hash = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    const match = filters.find(option => option.slug === hash || option.slug === `region-${hash}` || option.key === hash || option.hashes?.includes(hash));
    if (match?.href) {
      const target = new URL(match.href, window.location.origin);
      target.search = window.location.search;
      window.location.replace(target.pathname + target.search);
      return;
    }
    if (match) { setCategory(match.key); setLimit(PAGE_SIZE); }
  }, [filters]);
  const filtered = useMemo(() => {
    const ids = category === "all" ? null : new Set(filters.find(option => option.key === category)?.projectIds ?? []);
    return ids ? projects.filter(project => ids.has(project.id)) : projects;
  }, [projects, category, filters]);

  const visible = filtered.slice(0, limit);
  const remaining = Math.max(0, filtered.length - limit);
  const hasMore = remaining > 0;

  /* The next page arrives when the sentinel is a viewport away, before the
     reader reaches the end  the gap they would have scrolled into is already
     filled. The observer is rebuilt when the sentinel unmounts (nothing left)
     and remounts (a filter change resets the limit). */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setLimit((n) => n + PAGE_SIZE); },
      { rootMargin: "0px 0px 100% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, category]);

  return (
    <div className="mia-projects-page" style={{ position: "relative" }}>
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

      <section id="project-filters-section" style={{ position: "relative", background: "var(--ivory)", overflow: "hidden" }}>
        <div
          aria-hidden="true"
          data-aqsa-pattern=""
          style={{ position: "absolute", inset: 0, backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')", backgroundRepeat: "repeat", backgroundSize: "520px 520px", opacity: 0.05, pointerEvents: "none" }}
        />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "30px 24px 34px", display: "grid", gap: 18 }}>
          <div className="proj-filters-wrap">
            <div className="mia-rail" id="proj-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", paddingBottom: 4 }}>
            {categories.map((c) => {
              const style = {
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
                whiteSpace: "nowrap" as const,
                transition: "all .18s ease",
                border: "1px solid var(--border)",
                background: "#fff",
                color: "var(--muted)",
                textDecoration: "none",
              };

              const content = <>
                <span style={{ display: "inline-flex", width: 15, height: 15 }}>
                  <CategoryIcon name={c.icon} />
                </span>
                {c.name}
                {!c.href ? <span className="proj-cat-count" style={{ fontSize: 11, opacity: .7 }} aria-hidden="true">{c.projectIds.length}</span> : null}
              </>;

              if (c.href) return (
                <Link key={c.key} href={c.href} prefetch={false} data-filter-key={c.key} className="proj-cat" style={style}>
                  {content}
                </Link>
              );

              return (
                <button
                  key={c.key}
                  type="button"
                  data-filter-key={c.key}
                  data-cat={category === c.key ? "1" : ""}
                  aria-pressed={category === c.key}
                  aria-controls="all"
                  onClick={() => {
                    setCategory(c.key);
                    setLimit(PAGE_SIZE);
                  }}
                  className="proj-cat"
                  style={style}
                >
                  {content}
                </button>
              );
            })}
            </div>
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
            <div ref={sentinelRef} style={{ display: "flex", justifyContent: "center", paddingTop: 26 }} aria-live="polite">
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
