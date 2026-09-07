"use client";

import Link from "next/link";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { verseBlock } from "@/lib/minbar/quran";

/**
 * "'Ibādan Lanā" (عبادًا لنا) — the programme raising a Qur'anic generation to
 * guard Al-Quds and Al-Aqsa. Ported from `Minbar/عبادا لنا بانر.dc.html`, a
 * shared banner imported by several pages.
 *
 * The banner opens on Al-Isra 5, the verse the project takes its name from: the
 * Arabic always, with the translation of the meaning and its edition
 * attribution beneath it outside Arabic sessions.
 *
 * The project's own wordmark is a bilingual asset — the Arabic lockup in the
 * Arabic edition, the Latin one everywhere else.
 */
export default function IbadanBanner() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");
  const messages = useMessages() as { quran?: Record<string, { ar?: string; label?: string; t?: string }> };
  const verse = verseBlock(messages.quran ?? {}, "isra_5", locale);

  const projectHref = miaPath("ibadanProject", locale);
  const logo = locale === "ar" ? "/minbar/assets/ibadan-logo.jpg" : "/minbar/assets/ibadan-logo-en.png";

  return (
    <section id="ibadan-banner" style={{ position: "relative", zIndex: 1, padding: "0 0 56px", color: "#10212B" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div className="ibadan-wrap" style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#7C2318", boxShadow: "0 18px 44px rgba(16,33,43,.14)" }}>
          <div style={{ position: "relative", zIndex: 3, display: "grid", justifyItems: "center", gap: 6, textAlign: "center", padding: "14px 24px 12px", background: "#FFFDF8", borderBottom: "1px solid rgba(211,154,39,.4)" }}>
            <p dir="rtl" style={{ margin: 0, fontFamily: "var(--font-quran)", fontSize: "clamp(15px,1.6vw,19px)", lineHeight: 1.7, fontWeight: 800, color: "#7C2318", textWrap: "balance" }}>
              {verse.arabic}
            </p>
            {verse.translation ? (
              <>
                <p style={{ margin: 0, maxWidth: "72ch", fontSize: 13.5, lineHeight: 1.85, color: "#52616B", textWrap: "pretty" }}>{verse.translation}</p>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", fontSize: 10.5, color: "#52616B", opacity: 0.8 }}>
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(211,154,39,.5)" }} />
                  {verse.attribution}
                  <span aria-hidden="true" style={{ width: 20, height: 1, background: "rgba(211,154,39,.5)" }} />
                </span>
              </>
            ) : null}
          </div>

          <div className="ibadan-body" style={{ position: "relative", minHeight: 340 }}>
            <img
              src="/minbar/assets/ibadan-hero.jpg"
              alt={t("ibadanSubtitle")}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 32%" }}
            />
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(16,33,43,.86) 0%, rgba(16,33,43,.38) 46%, rgba(16,33,43,.06) 72%, transparent 100%)", pointerEvents: "none" }} />

            <Link
              href={projectHref}
              className="ibadan-logo"
              style={{ position: "absolute", insetInlineEnd: 18, top: 18, zIndex: 3, display: "grid", placeItems: "center", width: "min(26vw, 140px)", padding: "8px 12px", background: "rgba(255,255,255,.95)", borderRadius: 10, boxShadow: "0 12px 30px rgba(16,33,43,.28)" }}
            >
              <img src={logo} alt={t("ibadanHeading1")} style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }} />
            </Link>

            <div
              className="ibadan-content"
              style={{ position: "relative", zIndex: 2, display: "grid", justifyItems: "start", textAlign: "start", gap: 14, marginInlineEnd: "auto", maxWidth: 620, padding: "34px 30px 28px 36px", minHeight: 340, alignContent: "end" }}
            >
              <h2 style={{ margin: 0, whiteSpace: "nowrap", fontSize: "clamp(18px,2vw,28px)", lineHeight: 1.5, fontWeight: 900, letterSpacing: "-.01em", color: "#fff", textShadow: "0 2px 18px rgba(16,33,43,.55)" }}>
                {t("ibadanHeading1")}
                <br />
                {t("ibadanSubtitle")}
              </h2>

              <div className="ibadan-ctas" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                <Link
                  href={projectHref}
                  className="ibadan-cta"
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 24px", borderRadius: 8, background: "#A93428", color: "#fff", fontWeight: 900, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none", boxShadow: "0 10px 26px rgba(169,52,40,.4)" }}
                >
                  {tCommon("donate")}
                </Link>
                <Link
                  href={projectHref}
                  className="ibadan-cta"
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 24px", borderRadius: 8, background: "rgba(255,255,255,.94)", color: "#7C2318", fontWeight: 900, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none" }}
                >
                  {t("learnProject")}
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
                    <path d="M14 6l-6 6 6 6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
