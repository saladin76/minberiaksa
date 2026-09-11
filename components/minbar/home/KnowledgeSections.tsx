"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import type { MinbarArticle } from "@/lib/minbar/posts";
import type { CmsFaq } from "@/lib/minbar/cms";
import { ArrowGlyph } from "./TopSections";
import ViewAllLink from "./ViewAllLink";

/**
 * The knowledge end of the homepage — articles, news and the FAQ. Ported from
 * `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * Everything shown here is CMS content, read on the server by the page and
 * passed down: the articles and news are posts, the FAQ is the Faq model. The
 * hand-written lists that used to sit in this file were the design's
 * placeholders and are gone — an editor publishes, and it appears.
 */

/* ── Articles ───────────────────────────────────────────────────────────────
 * The four newest published posts. The topic chip is the post's category. */
export function ArticlesSection({ articles }: { articles: MinbarArticle[] }) {
  const locale = useLocale();
  const t = useTranslations("homepage");

  if (articles.length === 0) return null;

  return (
    <section id="blog" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.52), rgba(247,242,234,.78))", padding: "48px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(25px,2.5vw,34px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("blogTitle")}</h2>
          <ViewAllLink href={miaPath("blog", locale)}>{t("allArticles")}</ViewAllLink>
        </div>
        <div id="articles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 18 }}>
          {articles.map((article) => (
            <Link
              key={article.id}
              href={`${miaPath("blog", locale)}/${encodeURIComponent(article.slug)}`}
              className="mia-lift"
              style={{ display: "flex", flexDirection: "column", color: "var(--deep)", textDecoration: "none", background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}
            >
              <span style={{ position: "relative", display: "block", aspectRatio: "3 / 2", background: "var(--deep)", overflow: "hidden" }}>
                {article.cover ? (
                  <span role="img" aria-label={article.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${article.cover}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                ) : null}
                <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.42), transparent 55%)" }} />
                {article.category ? (
                  <span style={{ position: "absolute", insetInlineStart: 14, top: 14, display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, background: "rgba(255,253,248,.95)", color: "var(--deep)", fontSize: 11, fontWeight: 900 }}>
                    <span style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                    {article.category.name}
                  </span>
                ) : null}
              </span>
              <span style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 10, padding: 22, flex: "1 1 auto" }}>
                <b
                  style={{
                    fontSize: 19,
                    lineHeight: 1.5,
                    minHeight: "2.9em",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {article.title}
                </b>
                <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12, fontWeight: 800, alignSelf: "end" }}>
                  <span style={{ color: "var(--red)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {t("readArticle")}
                    <ArrowGlyph size={12} />
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

/* ── News ───────────────────────────────────────────────────────────────────
 * A lead item plus up to three secondary rows: the newest posts filed under
 * the `news` category (`listNews`). With nothing filed there the section is
 * not rendered — an empty news block says less than no news block. */
export function NewsSection({ news }: { news: MinbarArticle[] }) {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");

  if (news.length === 0) return null;
  const [lead, ...rest] = news;
  const articleHref = (a: MinbarArticle) => `${miaPath("blog", locale)}/${encodeURIComponent(a.slug)}`;

  return (
    <section id="news" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.56), rgba(247,242,234,.80))", padding: "0 0 48px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(25px,2.5vw,34px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{tNav("news")}</h2>
          <ViewAllLink href={miaPath("news", locale)}>{t("allNews")}</ViewAllLink>
        </div>
        <div id="news-grid" style={{ display: "grid", gridTemplateColumns: rest.length ? "minmax(0,1.4fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 22, alignItems: "start" }}>
          <Link href={articleHref(lead)} style={{ position: "relative", display: "block", minHeight: 340, borderRadius: 14, overflow: "hidden", background: "var(--deep)" }}>
            {lead.cover ? (
              <span role="img" aria-label={lead.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${lead.cover}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
            ) : null}
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.92) 6%, rgba(16,33,43,.35) 52%, transparent 82%)" }} />
            <span style={{ position: "absolute", insetInline: 24, bottom: 24, display: "grid", gap: 10 }}>
              {lead.category ? (
                <span style={{ justifySelf: "start", padding: "5px 11px", borderRadius: 999, background: "var(--red)", color: "#fff", fontSize: 11, fontWeight: 900 }}>
                  {lead.category.name}
                </span>
              ) : null}
              <b style={{ color: "#fff", fontSize: "clamp(20px,2.2vw,28px)", lineHeight: 1.45, maxWidth: "24ch" }}>{lead.title}</b>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--gold)", fontSize: 13, fontWeight: 800 }}>
                {t("readNews")}
                <ArrowGlyph />
              </span>
            </span>
          </Link>
          {rest.length ? (
            <div id="news-list" style={{ display: "grid", gap: 12 }}>
              {rest.map((item) => (
                <Link
                  key={item.id}
                  href={articleHref(item)}
                  className="mia-lift"
                  style={{ display: "grid", gridTemplateColumns: "116px minmax(0,1fr) 20px", gap: 16, alignItems: "center", padding: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}
                >
                  <span style={{ position: "relative", display: "block", aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", background: "var(--deep)" }}>
                    {item.cover ? (
                      <span role="img" aria-label={item.title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${item.cover}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    ) : null}
                  </span>
                  <span style={{ display: "grid", gap: 8, minWidth: 0 }}>
                    {item.category ? (
                      <span style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, background: "var(--sand)", fontSize: 11, fontWeight: 900, color: "var(--deep)" }}>
                        <span style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                        {item.category.name}
                      </span>
                    ) : null}
                    <b style={{ fontSize: 16, lineHeight: 1.6 }}>{item.title}</b>
                  </span>
                  <span style={{ color: "var(--gold)" }} aria-hidden="true">
                    <ArrowGlyph size={17} />
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────────
 * Questions come from the Faq model; each row's `page` is the category it was
 * filed under, and the filter chips are built from whatever categories the
 * rows actually use. The chip label is an interface string where one exists
 * for that id (zakat, waqf, donation, reports) and the raw id otherwise, so an
 * editor can introduce a new category without a code change and still see it
 * filter correctly — comparing ids, never labels. */
const CATEGORY_LABEL: Record<string, { ns: "navigation" | "common"; key: string }> = {
  zakat: { ns: "navigation", key: "zakat" },
  waqf: { ns: "navigation", key: "waqf" },
  donation: { ns: "common", key: "donate" },
  reports: { ns: "navigation", key: "reports" },
};

export function FaqSection({ faqs, whatsappNumber = "905398436050" }: { faqs: CmsFaq[]; whatsappNumber?: string }) {
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const tSystem = useTranslations("system");

  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState(0);

  const categories = useMemo(() => {
    const ids: string[] = [];
    for (const f of faqs) if (f.page && !ids.includes(f.page)) ids.push(f.page);
    return ids;
  }, [faqs]);

  const label = (id: string) => {
    const m = CATEGORY_LABEL[id];
    if (!m) return id;
    return m.ns === "navigation" ? tNav(m.key) : tCommon(m.key);
  };

  const visible = faqs.filter((f) => category === "all" || f.page === category);

  if (faqs.length === 0) return null;

  return (
    <section id="faq" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.60), rgba(247,242,234,.84))", padding: "48px 0", borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div id="faq-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,.34fr) minmax(0,1fr)", gap: 44, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18, justifyItems: "start", position: "sticky", top: 90 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(25px,2.5vw,34px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("faqTitle")}</h2>
          <div id="faq-chips" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["all", ...categories].map((id) => (
              <button
                key={id}
                type="button"
                data-chip={category === id ? "faq" : ""}
                onClick={() => {
                  setCategory(id);
                  setOpen(0);
                }}
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  transition: "all .18s ease",
                  border: "1px solid var(--border)",
                  background: "#fff",
                  color: "var(--muted)",
                }}
              >
                {id === "all" ? tSystem("allFilter") : label(id)}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gap: 10, width: "100%", padding: 20, background: "#fff", border: "1px solid rgba(211,154,39,.45)", borderRadius: 14, boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}>
            <b style={{ fontSize: 16 }}>{t("faqNotFound")}</b>
            <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>{t("faqWhatsapp")}</span>
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--green)", fontWeight: 800, fontSize: 14 }}
            >
              {tNav("contact")}
              <ArrowGlyph />
            </a>
          </div>
        </div>

        <div style={{ display: "grid", background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}>
          {visible.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div
                key={faq.id}
                style={{
                  borderBottom: i === visible.length - 1 ? "0" : "1px solid var(--border)",
                  background: isOpen ? "rgba(247,242,234,.7)" : "transparent",
                  transition: "background .18s ease",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: 20, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 17, fontWeight: 800, color: "var(--deep)", textAlign: "start" }}
                >
                  {faq.page ? (
                    <span style={{ flex: "0 0 auto", padding: "3px 9px", borderRadius: 999, background: "rgba(211,154,39,.12)", color: "#8a6415", fontSize: 11, fontWeight: 900 }}>
                      {label(faq.page)}
                    </span>
                  ) : null}
                  {faq.question}
                  <span style={{ marginInlineStart: "auto", flex: "0 0 auto", display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", color: "var(--gold)", fontSize: 16 }} aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen ? (
                  <div style={{ padding: "0 20px 22px", color: "var(--muted)", fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-line" }}>{faq.answer}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
