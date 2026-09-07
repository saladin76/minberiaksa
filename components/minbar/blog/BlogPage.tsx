"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { localeDirection } from "@/lib/locales";
import type { MinbarArticle, MinbarPostCategory } from "@/lib/minbar/posts";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import { NoResults, ContentError, ContentSkeleton } from "@/components/minbar/states/ContentStates";

/**
 * The blog — ported from `Minbar/المدونة.dc.html`.
 *
 * A sticky category rail beside a three-up grid of article cards, with
 * incremental paging rather than one page of every article: the handoff's note
 * is that loading 178 covers at once is what makes a blog feel broken.
 *
 * Two departures from the handoff, both consequences of wiring this to the real
 * CMS instead of its static `blog-articles-data.js`:
 *  - the chips are the categories that actually have published articles, so
 *    adding one in the dashboard adds a filter with no code change;
 *  - filtering compares category **ids**, never displayed names — a name is
 *    translated, and comparing names detaches the filter from its own state the
 *    moment the site is read in another language.
 */

export interface BlogPageProps {
  initialArticles: MinbarArticle[];
  initialCursor: string | null;
  categories: MinbarPostCategory[];
}

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

function chipStyle(active: boolean) {
  return {
    textAlign: "start" as const,
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13.5,
    fontWeight: active ? 900 : 700,
    border: "1px solid transparent",
    borderInlineStartWidth: 3,
    borderInlineStartColor: active ? "var(--gold)" : "transparent",
    background: active ? "rgba(211,154,39,.12)" : "transparent",
    color: active ? "#10212B" : "var(--muted)",
    transition: "all .18s ease",
  };
}

export default function BlogPage({ initialArticles, initialCursor, categories }: BlogPageProps) {
  const locale = useLocale();
  const t = useTranslations("blog");
  const tCommon = useTranslations("common");
  const tSystem = useTranslations("system");

  /* The hero gradient deepens away from the reader, so it flips with the
     writing direction rather than always pointing left. */
  const heroGradient = `linear-gradient(to ${localeDirection(locale) === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [articles, setArticles] = useState(initialArticles);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  /* Set when a page or a category switch failed, so the reader is told rather
     than left looking at a grid that quietly did not change. */
  const [failed, setFailed] = useState<null | (() => void)>(null);

  const fetchPage = useCallback(
    async (nextCategoryId: string | null, nextCursor: string | null) => {
      const params = new URLSearchParams({ locale });
      if (nextCategoryId) params.set("categoryId", nextCategoryId);
      if (nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/minbar/posts?${params.toString()}`);
      if (!res.ok) throw new Error("load failed");
      return (await res.json()) as { items: MinbarArticle[]; nextCursor: string | null };
    },
    [locale]
  );

  const selectCategory = async (nextCategoryId: string | null) => {
    if (nextCategoryId === categoryId || loading) return;
    setCategoryId(nextCategoryId);
    setLoading(true);
    setFailed(null);
    try {
      const page = await fetchPage(nextCategoryId, null);
      setArticles(page.items);
      setCursor(page.nextCursor);
    } catch {
      /* Keep the chip selected and offer the request again, rather than
         silently reverting to a category the reader did not choose. */
      setFailed(() => () => selectCategory(nextCategoryId));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(null);
    try {
      const page = await fetchPage(categoryId, cursor);
      setArticles((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      /* The cursor is kept, so the same page can be asked for again. */
      setFailed(() => loadMore);
    } finally {
      setLoading(false);
    }
  };

  const chips: Array<{ id: string | null; label: string }> = [
    { id: null, label: tSystem("allFilter") },
    ...categories.map((category) => ({ id: category.id, label: category.name })),
  ];

  return (
    <div className="blog-page">
      <section id="hero" style={{ position: "relative", background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "34px 24px", display: "grid", justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(26px,2.6vw,36px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>
            {tCommon("blogTitle")}
          </h1>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "60px 0" }}>
        <div style={SECTION}>
          <div className="blog-layout" style={{ display: "grid", gridTemplateColumns: "236px minmax(0,1fr)", gap: 32, alignItems: "start" }}>
            <aside
              className="blog-side"
              aria-label={t("categoriesTitle")}
              style={{ position: "sticky", top: 92, display: "grid", gap: 4, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}
            >
              <b style={{ padding: "4px 12px 10px", fontSize: 12, fontWeight: 900, letterSpacing: ".04em", color: "var(--gold)" }}>
                {t("categoriesTitle")}
              </b>
              {chips.map((chip) => (
                <button
                  key={chip.id ?? "all"}
                  type="button"
                  onClick={() => selectCategory(chip.id)}
                  aria-pressed={chip.id === categoryId}
                  style={chipStyle(chip.id === categoryId)}
                >
                  {chip.label}
                </button>
              ))}
            </aside>

            <div style={{ display: "grid", gap: 30 }}>
              <div className="blog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 22, opacity: loading ? 0.6 : 1, transition: "opacity .18s ease" }}>
                {articles.map((article) => (
                  <Link
                    key={article.id}
                    href={`${miaPath("blog", locale)}/${encodeURIComponent(article.slug)}`}
                    className="blog-card"
                    style={{ display: "grid", alignContent: "start", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}
                  >
                    <span style={{ position: "relative", display: "block", aspectRatio: "16/10", background: "var(--sand)" }}>
                      {article.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary CMS URLs, not a known-host set
                        <img
                          src={article.cover}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </span>
                    <span style={{ display: "grid", gap: 8, padding: 20 }}>
                      {article.category ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>
                          {article.category.name}
                        </span>
                      ) : null}
                      <b style={{ fontSize: 17, lineHeight: 1.4 }}>{article.title}</b>
                      {article.excerpt ? (
                        <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>{article.excerpt}</span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </div>

              {failed ? <ContentError onRetry={failed} /> : null}

              {loading && articles.length === 0 ? <ContentSkeleton count={6} /> : null}

              {articles.length === 0 && !loading && !failed ? (
                <NoResults onReset={categoryId ? () => selectCategory(null) : undefined} />
              ) : null}

              {cursor ? (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loading}
                    className="blog-more"
                    style={{ height: 48, padding: "0 30px", borderRadius: 8, border: "1px solid var(--gold)", background: "#fff", color: "#10212B", fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", transition: "background .18s ease" }}
                  >
                    {t("loadMore")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
