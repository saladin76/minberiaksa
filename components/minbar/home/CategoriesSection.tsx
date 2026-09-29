"use client";

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
 */
export default function CategoriesSection({ categories }: { categories: MinbarCategory[] }) {
  const locale = useLocale();
  const t = useTranslations("CategoryNav");
  const tProjects = useTranslations("projects");

  if (!categories.length) return null;

  return (
    <section id="categories" className="mia-cat-section">
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

        <div className="mia-cat-grid">
          {categories.map((c) => (
            <Link key={c.id} href={c.href} className="mia-cat-card">
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
      </div>
    </section>
  );
}
