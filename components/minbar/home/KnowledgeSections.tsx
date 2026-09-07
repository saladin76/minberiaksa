"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { IMG } from "@/lib/minbar/content/media";
import { ArrowGlyph } from "./TopSections";

/**
 * The knowledge end of the homepage — articles, news and the FAQ. Ported from
 * `Minbar/الصفحة الرئيسية.dc.html`.
 */

/* ── Articles ───────────────────────────────────────────────────────────────
 * Four evergreen explainers. The topic chip is an interface category translated
 * from `navigation`/`homepage`, not dashboard content. */
const ARTICLES = [
  { titleKey: "kbZakatTitle", topicNs: "navigation", topicKey: "zakat", image: IMG.minber },
  { titleKey: "kbWaqfTitle", topicNs: "navigation", topicKey: "waqf", image: IMG.aqsa },
  { titleKey: "kbRecurringTitle", topicNs: "navigation", topicKey: "recurring", image: IMG.quds },
  { titleKey: "kbReportsTitle", topicNs: "homepage", topicKey: "storyReports", image: IMG.parcels },
] as const;

export function ArticlesSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");

  return (
    <section id="blog" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.52), rgba(247,242,234,.78))", padding: "56px 0" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("blogTitle")}</h2>
          <Link href={miaPath("blog", locale)} style={{ color: "var(--red)", fontWeight: 800, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {t("allArticles")}
            <ArrowGlyph />
          </Link>
        </div>
        <div id="articles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 18 }}>
          {ARTICLES.map((article) => {
            const title = t(article.titleKey);
            const topic = article.topicNs === "navigation" ? tNav(article.topicKey) : t(article.topicKey);
            return (
              <Link
                key={article.titleKey}
                href={miaPath("blog", locale)}
                className="mia-lift"
                style={{ display: "flex", flexDirection: "column", color: "var(--deep)", textDecoration: "none", background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}
              >
                <span style={{ position: "relative", display: "block", aspectRatio: "3 / 2", background: "var(--deep)", overflow: "hidden" }}>
                  <span role="img" aria-label={title} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${article.image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                  <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.42), transparent 55%)" }} />
                  <span style={{ position: "absolute", insetInlineStart: 14, top: 14, display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, background: "rgba(255,253,248,.95)", color: "var(--deep)", fontSize: 11, fontWeight: 900 }}>
                    <span style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                    {topic}
                  </span>
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
                    {title}
                  </b>
                  <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 12, fontWeight: 800, alignSelf: "end" }}>
                    <span style={{ color: "var(--red)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {t("readArticle")}
                      <ArrowGlyph size={12} />
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── News ───────────────────────────────────────────────────────────────────
 * A lead item plus three secondary rows. Hardcoded in the handoff and flagged
 * for a News API in COMPONENT_INVENTORY. */
const NEWS = [
  { titleKey: "news1", tagKey: "storyGaza", image: IMG.parcels },
  { titleKey: "news2", tagKey: "regionQuds", image: IMG.quds },
  { titleKey: "news3", tagKey: "regionAqsa", image: IMG.aqsa },
] as const;

export function NewsSection() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");

  return (
    <section id="news" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.56), rgba(247,242,234,.80))", padding: "0 0 56px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{tNav("news")}</h2>
          <Link href={miaPath("news", locale)} style={{ color: "var(--red)", fontWeight: 800, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {t("allNews")}
            <ArrowGlyph />
          </Link>
        </div>
        <div id="news-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 22, alignItems: "start" }}>
          <Link href={miaPath("news", locale)} style={{ position: "relative", display: "block", minHeight: 340, borderRadius: 14, overflow: "hidden", background: "var(--deep)" }}>
            <span role="img" aria-label={t("newsLead")} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${IMG.meals}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(16,33,43,.92) 6%, rgba(16,33,43,.35) 52%, transparent 82%)" }} />
            <span style={{ position: "absolute", insetInline: 24, bottom: 24, display: "grid", gap: 10 }}>
              <span style={{ justifySelf: "start", padding: "5px 11px", borderRadius: 999, background: "var(--red)", color: "#fff", fontSize: 11, fontWeight: 900 }}>
                {t("storyGaza")} · {t("catFieldUpdate")}
              </span>
              <b style={{ color: "#fff", fontSize: "clamp(20px,2.2vw,28px)", lineHeight: 1.45, maxWidth: "24ch" }}>{t("newsLead")}</b>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--gold)", fontSize: 13, fontWeight: 800 }}>
                {t("readNews")}
                <ArrowGlyph />
              </span>
            </span>
          </Link>
          <div style={{ display: "grid", gap: 12 }}>
            {NEWS.map((item) => (
              <Link
                key={item.titleKey}
                href={miaPath("news", locale)}
                className="mia-lift"
                style={{ display: "grid", gridTemplateColumns: "116px minmax(0,1fr) 20px", gap: 16, alignItems: "center", padding: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}
              >
                <span style={{ position: "relative", display: "block", aspectRatio: "4 / 3", borderRadius: 10, overflow: "hidden", background: "var(--deep)" }}>
                  <span role="img" aria-label={t(item.titleKey)} style={{ position: "absolute", inset: 0, display: "block", backgroundImage: `url('${item.image}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                </span>
                <span style={{ display: "grid", gap: 8, minWidth: 0 }}>
                  <span style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999, background: "var(--sand)", fontSize: 11, fontWeight: 900, color: "var(--deep)" }}>
                    <span style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
                    {t(item.tagKey)}
                  </span>
                  <b style={{ fontSize: 16, lineHeight: 1.6 }}>{t(item.titleKey)}</b>
                </span>
                <span style={{ color: "var(--gold)" }} aria-hidden="true">
                  <ArrowGlyph size={17} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────────
 * Eleven questions across four categories. Filtering compares category ids, not
 * displayed labels — comparing labels would detach the filter from its state the
 * moment the labels were translated. */
const FAQ_CATEGORIES = [
  { id: "all", ns: "system", key: "allFilter" },
  { id: "zakat", ns: "navigation", key: "zakat" },
  { id: "waqf", ns: "navigation", key: "waqf" },
  { id: "donation", ns: "common", key: "donate" },
  { id: "reports", ns: "navigation", key: "reports" },
] as const;

const FAQS = [
  { cat: "zakat", n: 1 },
  { cat: "zakat", n: 2 },
  { cat: "zakat", n: 3 },
  { cat: "waqf", n: 4 },
  { cat: "waqf", n: 5 },
  { cat: "waqf", n: 6 },
  { cat: "donation", n: 7 },
  { cat: "donation", n: 8 },
  { cat: "donation", n: 9 },
  { cat: "reports", n: 10 },
  { cat: "reports", n: 11 },
] as const;

export function FaqSection({ whatsappNumber = "905398436050" }: { whatsappNumber?: string }) {
  const t = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tCommon = useTranslations("common");
  const tSystem = useTranslations("system");

  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState(0);

  const label = (ns: string, key: string) =>
    ns === "system" ? tSystem(key) : ns === "navigation" ? tNav(key) : tCommon(key);

  const visible = FAQS.filter((f) => category === "all" || f.cat === category);

  return (
    <section id="faq" style={{ position: "relative", zIndex: 1, background: "linear-gradient(to left, rgba(247,242,234,.60), rgba(247,242,234,.84))", padding: "56px 0", borderTop: "1px solid var(--border)", overflow: "hidden" }}>
      <div id="faq-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,.34fr) minmax(0,1fr)", gap: 44, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18, justifyItems: "start", position: "sticky", top: 90 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px,3vw,42px)", lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" }}>{t("faqTitle")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FAQ_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                data-chip={category === c.id ? "faq" : ""}
                onClick={() => {
                  setCategory(c.id);
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
                {label(c.ns, c.key)}
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
            const catLabel = label(
              FAQ_CATEGORIES.find((c) => c.id === faq.cat)?.ns ?? "navigation",
              FAQ_CATEGORIES.find((c) => c.id === faq.cat)?.key ?? faq.cat
            );
            return (
              <div
                key={faq.n}
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
                  <span style={{ flex: "0 0 auto", padding: "3px 9px", borderRadius: 999, background: "rgba(211,154,39,.12)", color: "#8a6415", fontSize: 11, fontWeight: 900 }}>
                    {catLabel}
                  </span>
                  {t(`faq${faq.n}Q`)}
                  <span style={{ marginInlineStart: "auto", flex: "0 0 auto", display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", color: "var(--gold)", fontSize: 16 }} aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen ? (
                  <div style={{ padding: "0 20px 22px", color: "var(--muted)", fontSize: 15, lineHeight: 1.9 }}>{t(`faq${faq.n}A`)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
