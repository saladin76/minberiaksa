"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { IMG } from "@/lib/minbar/content/media";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";

/**
 * "Journey to Al-Aqsa" (شدّ الرحال) — coaches carrying worshippers to the
 * Blessed Mosque every Friday. Ported from `Minbar/شد الرحال.dc.html`, which the
 * handoff lists as a shared banner imported by several pages.
 *
 * Two price points: a single seat and a whole coach. Both are USD figures
 * converted for display; the donation itself is priced server-side.
 *
 * The photograph is desaturated so the red panel and the gold price chips stay
 * the only strong colour in the band.
 */

const SEAT_USD = 15;
const BUS_USD = 750;
/** The project this banner sells, in `projects-data` terms. */
const PROJECT_SLUG = "al-quds-friday-transport";

export default function TravelBanner() {
  const locale = useLocale();
  const t = useTranslations("homepage");
  const { format } = useMinbarMoney();

  const href = miaPath("projectDetail", locale, PROJECT_SLUG);

  return (
    <section id="friday" style={{ position: "relative", zIndex: 1, padding: "0 0 56px", color: "#10212B" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
        <div className="friday-wrap" style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#A93428", boxShadow: "0 18px 44px rgba(16,33,43,.14)" }}>
          <div
            id="friday-quote"
            style={{ position: "relative", zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: "10px 24px", background: "#FFFDF8", borderBottom: "1px solid rgba(211,154,39,.4)" }}
          >
            <span aria-hidden="true" style={{ flex: "0 0 auto", width: 5, height: 5, background: "#D39A27", transform: "rotate(45deg)" }} />
            <p style={{ margin: 0, fontFamily: "var(--font-ar)", fontSize: "clamp(15px,1.6vw,19px)", lineHeight: 1.6, fontWeight: 800, color: "#A93428" }}>
              {t("fridayQuote")}
            </p>
            <span aria-hidden="true" style={{ flex: "0 0 auto", width: 5, height: 5, background: "#D39A27", transform: "rotate(45deg)" }} />
          </div>

          <div className="friday-body" style={{ position: "relative", minHeight: 340 }}>
            <span
              role="img"
              aria-label={t("fridaySubtitle")}
              style={{
                position: "absolute",
                inset: 0,
                display: "block",
                backgroundImage: `url('${IMG.minber}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "grayscale(1) contrast(1.06)",
              }}
            />
            <span
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(16,33,43,.86) 0%, rgba(16,33,43,.38) 46%, rgba(16,33,43,.06) 72%, transparent 100%)", pointerEvents: "none" }}
            />

            <div className="friday-prices" style={{ position: "absolute", insetInlineEnd: 18, top: 18, zIndex: 3, display: "flex", alignItems: "stretch", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,.95)", boxShadow: "0 14px 34px rgba(16,33,43,.3)" }}>
                <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 22, fontWeight: 900, lineHeight: 1, color: "#10212B" }}>
                  {format(SEAT_USD)}
                </b>
                <span style={{ fontSize: 10, fontWeight: 800, lineHeight: 1.4, color: "#52616B" }}>
                  {t("seat")}
                  <br />
                  {t("one")}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#D39A27", boxShadow: "0 14px 34px rgba(16,33,43,.3)" }}>
                <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 22, fontWeight: 900, lineHeight: 1, color: "#10212B" }}>
                  {format(BUS_USD)}
                </b>
                <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1.4, color: "#10212B" }}>
                  {t("bus")}
                  <br />
                  {t("full")}
                </span>
              </span>
            </div>

            <div
              className="friday-content"
              style={{
                position: "relative",
                zIndex: 2,
                display: "grid",
                justifyItems: "start",
                textAlign: "start",
                gap: 14,
                marginInlineEnd: "auto",
                maxWidth: 620,
                padding: "34px 30px 28px 36px",
                minHeight: 340,
                alignContent: "end",
              }}
            >
              <h2 style={{ margin: 0, whiteSpace: "nowrap", fontSize: "clamp(18px,2vw,28px)", lineHeight: 1.5, fontWeight: 900, letterSpacing: "-.01em", color: "#fff", textShadow: "0 2px 18px rgba(16,33,43,.55)" }}>
                {t("fridayHeading1")}
                <br />
                {t("fridaySubtitle")}
              </h2>

              <div className="friday-ctas" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                <Link
                  href={href}
                  className="friday-cta"
                  style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 24px", borderRadius: 8, background: "#A93428", color: "#fff", fontWeight: 900, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none", boxShadow: "0 10px 26px rgba(169,52,40,.4)" }}
                >
                  {t("donateBus")}
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mia-arrow-next">
                    <path d="M14 6l-6 6 6 6" />
                  </svg>
                </Link>
                <Link
                  href={href}
                  className="friday-cta"
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 46, padding: "0 24px", borderRadius: 8, background: "rgba(255,255,255,.94)", color: "#A93428", fontWeight: 900, fontSize: 14.5, whiteSpace: "nowrap", textDecoration: "none" }}
                >
                  {t("donateSeat")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
