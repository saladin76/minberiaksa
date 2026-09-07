"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { miaPath } from "@/lib/minbar/routes";
import type { MinbarArticle } from "@/lib/minbar/posts";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import { NoResults } from "@/components/minbar/states/ContentStates";

/**
 * The newsroom — ported from `Minbar/الأخبار.dc.html`.
 *
 * A dated, chronological list rather than the blog's category grid: news is
 * read newest-first, and the date is the point.
 *
 * The handoff's four items are placeholders with an em dash for a date and dead
 * `#news-1` links. These are real published posts filed under the newsroom
 * category, each carrying its own publication date and linking to the same
 * article page the blog links to.
 */

export interface NewsPageProps {
  items: MinbarArticle[];
}

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export default function NewsPage({ items }: NewsPageProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const tCommon = useTranslations("common");
  const tSystem = useTranslations("system");

  const heroGradient = `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  /* Dates are formatted for the reader's language, so an Arabic page shows an
     Arabic month name and a Japanese page a Japanese one. */
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="news-page">
      <section id="hero" style={{ position: "relative", background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "70px 24px", display: "grid", gap: 14, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px,3.4vw,46px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {tCommon("newsTitle")}
          </h1>
          <p style={{ margin: 0, maxWidth: "60ch", fontSize: 16, lineHeight: 1.9, color: "rgba(255,255,255,.92)" }}>
            {tCommon("newsLead")}
          </p>
        </div>
      </section>

      <section style={{ background: "#fff", padding: "60px 0" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 24px", display: "grid", gap: 18 }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`${miaPath("blog", locale)}/${encodeURIComponent(item.slug)}`}
              className="news-card"
              style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 20, alignItems: "start", padding: 18, background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}
            >
              <span style={{ position: "relative", display: "block", aspectRatio: "16/10", background: "var(--sand)", borderRadius: 8, overflow: "hidden" }}>
                {item.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary CMS URLs, not a known-host set
                  <img
                    src={item.cover}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </span>
              <span style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
                    <path d="M3.5 9h17M8 3v3M16 3v3" />
                  </svg>
                  <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time>
                </span>
                <b style={{ fontSize: 18, lineHeight: 1.4 }}>{item.title}</b>
                {item.excerpt ? (
                  <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>{item.excerpt}</span>
                ) : null}
              </span>
            </Link>
          ))}

          {items.length === 0 ? (
            <NoResults />
          ) : null}
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
