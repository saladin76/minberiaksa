"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";

/**
 * The zakat band — ported from `Minbar/بنر الزكاة.dc.html`, a shared banner
 * imported by the homepage and the zakat pages.
 *
 * The 2.5% rate is set as a numeral rather than a translated string: it is a
 * figure, not copy, and `DEVELOPER_HANDOFF §10` requires numerals to render
 * `dir="ltr"` and isolated so bidi cannot reorder them beside Arabic text.
 */
export default function ZakatBanner() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const tCommon = useTranslations("common");

  return (
    <section id="zakat" style={{ position: "relative", zIndex: 1, padding: "34px 0 56px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div
          className="mia-zakat-band"
          style={{
            position: "relative",
            overflow: "hidden",
            background: "linear-gradient(to left, #7C2318, #A93428)",
            borderRadius: 14,
            padding: "28px 34px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 28,
            flexWrap: "wrap",
            boxShadow: "0 16px 38px rgba(124,35,24,.24)",
          }}
        >
          <span
            aria-hidden="true"
            data-aqsa-pattern=""
            style={{
              position: "absolute",
              insetInlineStart: 0,
              top: 0,
              bottom: 0,
              width: "46%",
              backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
              backgroundRepeat: "repeat",
              backgroundSize: "190px 190px",
              opacity: 0.08,
              pointerEvents: "none",
            }}
          />
          <img
            src="/minbar/assets/aqsa-dome-line.png"
            alt=""
            aria-hidden="true"
            style={{ position: "absolute", insetInlineStart: -26, bottom: -26, width: 180, height: "auto", opacity: 0.14, pointerEvents: "none" }}
          />

          <div style={{ position: "relative", display: "grid", gap: 12, flex: "1 1 440px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,.14)", border: "1px solid rgba(211,154,39,.55)", color: "var(--gold)", flex: "0 0 auto" }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M14.5 9.5a2.6 2.6 0 0 0-2.5-1.4c-1.5 0-2.4.8-2.4 1.8 0 2.4 5 1.2 5 3.7 0 1.1-1 1.9-2.6 1.9a2.7 2.7 0 0 1-2.6-1.5M12 6.4v1.7M12 15.9v1.7" />
                </svg>
              </span>
              <h2 style={{ margin: 0, fontSize: "clamp(23px,2.3vw,31px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("zakatBannerTitle")}</h2>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "7px 8px 7px 15px", borderRadius: 999, background: "rgba(0,0,0,.16)", border: "1px solid rgba(211,154,39,.55)" }}>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 1, padding: "3px 10px", borderRadius: 999, background: "var(--gold)", color: "#10212B" }}>
                  <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 17, fontWeight: 900, lineHeight: 1 }}>
                    2.5
                  </b>
                  <b style={{ fontSize: 11, fontWeight: 900 }}>%</b>
                </span>
                <span style={{ color: "#F2D9A4", fontSize: 12.5, fontWeight: 800 }}>{t("zakatChipDue")}</span>
              </span>
            </div>
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link
              href={miaPath("zakat", locale)}
              className="mia-zakat-cta"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 26px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,255,255,.75)", color: "#fff", fontWeight: 900, fontSize: 16, whiteSpace: "nowrap", textDecoration: "none", transition: "background .18s ease, color .18s ease" }}
            >
              {tCommon("zakatNow")}
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
                <path d="M14 6l-6 6 6 6" />
              </svg>
            </Link>
            <Link
              href={miaPath("zakatCalculator", locale)}
              className="mia-zakat-cta-ghost"
              style={{ display: "inline-flex", alignItems: "center", height: 52, padding: "0 22px", borderRadius: 8, border: "1px solid rgba(255,255,255,.55)", color: "#fff", fontWeight: 800, fontSize: 15.5, whiteSpace: "nowrap", textDecoration: "none" }}
            >
              {tCommon("zakatCalculator")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
