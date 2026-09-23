"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { CTA_ROUTES } from "@/lib/minbar/blog-cta";

/**
 * The dark call that closes every article — ported from the `ctaFor()` block in
 * `Minbar/تفاصيل المقال.dc.html`.
 *
 * The handoff picks one of eleven calls from the article's category, so a piece
 * about Zakat ends on the Zakat rail and a piece about Gaza ends on Gaza relief.
 * All eleven are reviewed in `blog.cta.*` in 19 languages.
 *
 * Which of the eleven this article gets is decided by `ctaKeyFor` in
 * `lib/minbar/blog-cta.ts` — a server-safe module, because the article route
 * makes that decision server-side.
 */

export default function ArticleCta({ ctaKey }: { ctaKey: string }) {
  const locale = useLocale();
  const t = useTranslations("blog");
  const routes = CTA_ROUTES[ctaKey] ?? CTA_ROUTES.iman;

  return (
    <section style={{ position: "relative", background: "var(--deep)", overflow: "hidden" }}>
      <span aria-hidden="true" className="art-cta-pattern" />
      <div className="art-cta-row" style={{ position: "relative", maxWidth: 900, margin: "0 auto", padding: "40px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div className="art-cta-copy" style={{ display: "grid", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 900, letterSpacing: ".07em", color: "#F2D9A4" }}>
            <span aria-hidden="true" style={{ width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)" }} />
            {t(`cta.${ctaKey}.eyebrow`)}
          </span>
          <b style={{ fontSize: "clamp(19px,2vw,24px)", fontWeight: 900, color: "#fff" }}>{t(`cta.${ctaKey}.title`)}</b>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href={miaPath(routes.secondary, locale)}
            className="art-cta-secondary"
            style={{ display: "inline-flex", alignItems: "center", height: 50, padding: "0 22px", borderRadius: 8, border: "1px solid rgba(255,255,255,.35)", color: "#fff", fontWeight: 800, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {t(`cta.${ctaKey}.secondary`)}
          </Link>
          <Link
            href={miaPath(routes.primary, locale)}
            className="art-cta-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 50, padding: "0 24px", borderRadius: 8, background: "var(--red)", color: "#fff", fontWeight: 900, fontSize: 14.5, whiteSpace: "nowrap", boxShadow: "0 10px 24px rgba(169,52,40,.35)", textDecoration: "none" }}
          >
            {t(`cta.${ctaKey}.primary`)}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="art-cta-arrow">
              <path d="M10 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
