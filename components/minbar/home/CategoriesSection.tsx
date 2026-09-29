"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import CategoryIcon from "@/components/CategoryIcon";
import { miaPath } from "@/lib/minbar/routes";
import type { MinbarCategory } from "@/lib/minbar/categories";
import ViewAllLink from "./ViewAllLink";
import { ArrowGlyph } from "./TopSections";

/**
 * Every project category as a grid of picture cards, placed under the urgent
 * projects rail so a visitor who did not find their cause there can pick it.
 *
 * Each card is the category's photograph under the navy shade the region cards
 * use, its dashboard icon on a gold badge, the name, a live project count and
 * a link to the category's own landing page. A category without a picture
 * falls back to the navy ground with the Aqsa pattern, so a new category still
 * reads as part of the set. Styles live in `minbar.css` (`.mia-cat-*`).
 *
 * Only the first eight show at first  two full rows of four on desktop,
 * four of two on a phone  and a "show more" button opens the rest in place,
 * so the section stays a compact block on the home page however many
 * categories the dashboard adds.
 */

/** Two even rows on desktop (4 columns) and four on tablet and phone (2 columns). */
const INITIAL_VISIBLE = 8;
export default function CategoriesSection({ categories }: { categories: MinbarCategory[] }) {
  const locale = useLocale();
  const t = useTranslations("CategoryNav");
  const tProjects = useTranslations("projects");
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  if (!categories.length) return null;

  const hidden = Math.max(0, categories.length - INITIAL_VISIBLE);
  const shown = expanded ? categories : categories.slice(0, INITIAL_VISIBLE);

  const toggle = () => {
    /* Collapsing from far down the list would leave the visitor below the
       section they were reading; bring its heading back into view. */
    if (expanded) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setExpanded((v) => !v);
  };

  return (
    <section id="categories" ref={sectionRef} className="mia-cat-section">
      <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div className="mia-cat-head">
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <span className="mia-cat-eyebrow">
              <span aria-hidden="true" style={{ width: 7, height: 7, background: "var(--gold)", transform: "rotate(45deg)" }} />
              {t("sectionEyebrow")}
            </span>
            <h2 style={{ margin: 0, fontSize: "clamp(25px,2.5vw,34px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>
              {t("sectionTitle")}
            </h2>
            <p style={{ margin: 0, color: "var(--muted, #52616B)", fontSize: 15, lineHeight: 1.8, maxWidth: "60ch" }}>{t("sectionLead")}</p>
          </div>
          <ViewAllLink href={miaPath("projects", locale)}>{tProjects("allProjects")}</ViewAllLink>
        </div>

        <div id="categories-grid" className="mia-cat-grid">
          {shown.map((c, index) => (
            <Link
              key={c.id}
              href={c.href}
              className={`mia-cat-card${index >= INITIAL_VISIBLE ? " mia-cat-card--extra" : ""}`}
              /* The revealed cards arrive one after another rather than all at once. */
              style={index >= INITIAL_VISIBLE ? { animationDelay: `${Math.min(index - INITIAL_VISIBLE, 8) * 45}ms` } : undefined}
            >
              {c.image ? (
                <span className="mia-cat-card__media" style={{ backgroundImage: `url('${c.image}')` }} />
              ) : (
                <span className="mia-cat-card__media mia-cat-card__media--pattern" />
              )}
              <span className="mia-cat-card__shade" aria-hidden="true" />

              <span className="mia-cat-card__body">
                <span className="mia-cat-card__top">
                  <span className="mia-cat-card__icon" aria-hidden="true">
                    <CategoryIcon name={c.icon || null} className="mia-cat-glyph" />
                  </span>
                  <span className="mia-cat-card__count">{t("projectsCount", { count: c.projectCount })}</span>
                </span>

                <span className="mia-cat-card__foot">
                  <b className="mia-cat-card__name">{c.name}</b>
                  {c.description ? <span className="mia-cat-card__desc">{c.description}</span> : null}
                  <span className="mia-cat-card__go">
                    {t("explore")}
                    <ArrowGlyph size={13} />
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>

        {hidden > 0 ? (
          <div className="mia-cat-more">
            <button type="button" className="mia-cat-more__btn" onClick={toggle} aria-expanded={expanded} aria-controls="categories-grid">
              {expanded ? t("showLess") : t("showMore", { count: hidden })}
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform .2s ease" }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
