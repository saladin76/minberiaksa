"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";

/**
 * Our publications — ported from `Minbar/كتيبات المؤسسة.dc.html`.
 *
 * One card per booklet: its cover, what it is, and two ways to have it — read
 * in the browser, or downloaded.
 *
 * The handoff lists a single booklet, which is the only one that ships as an
 * asset (`Minbar/assets/books/`). Three further PDFs sit in `Minbar/src/`, but
 * nothing in the handoff says what they are called or who wrote them, so they
 * are not listed here: inventing a title and an author for someone else's book
 * is not a gap this port gets to fill.
 */

/**
 * The published booklets.
 *
 * `title` and `author` are proper names and stay as written in every language —
 * the same rule the video catalog applies to named speakers. Everything else is
 * interface copy and resolves through the `common` namespace.
 */
const BOOKLETS: ReadonlyArray<{
  id: string;
  title: string;
  author: string;
  summaryKey: string;
  file: string;
}> = [
  {
    id: "isharat-altanzil",
    title: "عبادًا لنا: إشارات التنزيل إلى صفات البعث على بني إسرائيل",
    author: "أسامة أبو بكر",
    summaryKey: "bookletIsharatSummary",
    file: "/minbar/assets/books/isharat-altanzil.pdf",
  },
];

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export default function PublicationsPage() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("common");

  const heroGradient = `linear-gradient(to ${dir === "rtl" ? "left" : "right"}, #7C2318, #A93428)`;

  return (
    <div className="bk-page">
      <section id="hero" style={{ position: "relative", zIndex: 1, background: heroGradient, overflow: "hidden" }}>
        <div aria-hidden="true" className="ab-hero-pattern" />
        <div style={{ ...SECTION, position: "relative", padding: "70px 24px", display: "grid", gap: 14, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(28px,3.4vw,46px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>
            {t("bookletsTitle")}
          </h1>
          <p style={{ margin: 0, maxWidth: "60ch", fontSize: 16, lineHeight: 1.9, color: "rgba(255,255,255,.92)" }}>
            {t("bookletsLead")}
          </p>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "60px 0 70px" }}>
        <div className="bk-grid" style={{ ...SECTION, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 20 }}>
          {BOOKLETS.map((booklet) => (
            <div
              key={booklet.id}
              className="bk-card"
              style={{ display: "grid", alignContent: "start", width: "100%", maxWidth: 260, marginInline: "auto", background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,33,43,.04)" }}
            >
              {/* The booklet has no cover artwork in the handoff, so the panel is
                  the sand ground with its gold rule rather than a stand-in
                  photograph from somewhere else. */}
              <span aria-hidden="true" style={{ position: "relative", display: "block", aspectRatio: "3 / 4", background: "var(--sand)", overflow: "hidden", borderBottom: "3px solid var(--gold)" }} />

              <span style={{ display: "grid", gap: 9, padding: 15 }}>
                <span style={{ display: "inline-flex", width: "fit-content", padding: "4px 12px", borderRadius: 999, background: "rgba(211,154,39,.14)", border: "1px solid rgba(211,154,39,.4)", color: "#8A5D16", fontSize: 9, fontWeight: 900, letterSpacing: ".02em", whiteSpace: "nowrap" }}>
                  {t("bookletTagFoundation")}
                </span>
                {/* A book title and an author's name keep their own script and
                    direction whatever language the page is read in. */}
                <b dir="rtl" style={{ fontSize: 15, lineHeight: 1.5, unicodeBidi: "isolate" }}>{booklet.title}</b>
                <span dir="rtl" style={{ color: "var(--gold)", fontSize: 13, fontWeight: 800, unicodeBidi: "isolate" }}>{booklet.author}</span>
                <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>{t(booklet.summaryKey)}</span>

                <span style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12.5, color: "var(--muted)", fontWeight: 700, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <span>{t("bookletFormatPdf")}</span>
                  <span style={{ marginInlineStart: "auto" }}>{t("bookletLanguageArabic")}</span>
                </span>

                <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href={booklet.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bk-read"
                    style={{ flex: "1 1 100px", height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, background: "var(--red)", color: "#fff", fontWeight: 900, fontSize: 13.5 }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 19.5V6a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v14" />
                      <path d="M6.5 19.5H19a1 1 0 0 0 1-1V17H8a1.5 1.5 0 0 0 0 3H6.5a1.5 1.5 0 0 1 0-3" />
                    </svg>
                    {t("readBooklet")}
                  </a>
                  <a
                    href={booklet.file}
                    download
                    className="bk-dl"
                    style={{ flex: "0 0 auto", height: 40, padding: "0 13px", display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 10, border: "1px solid var(--border)", fontWeight: 800, fontSize: 13, color: "var(--deep)" }}
                  >
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
                    </svg>
                    {t("download")}
                  </a>
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
