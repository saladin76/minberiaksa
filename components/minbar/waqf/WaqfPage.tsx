"use client";

import { useState, type CSSProperties, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import WaqfCertificatePreview from "./WaqfCertificatePreview";

/**
 * Al-Quds Waqf — ported from `Minbar/الأوقاف.dc.html`.
 *
 * Pricing is two fixed units and nothing else — no free amount:
 *   • a waqf **share** (سهم وقفي) = $100
 *   • a waqf **metre** (متر وقفي) = $1,500 — fifteen shares
 * That is a product decision in the handoff, not a UI convenience, so the
 * amount field is a counter rather than an input.
 *
 * The donor names the endower and who the waqf is made on behalf of; both go on
 * the certificate. The certificate preview updates live, but the real document
 * — and its serial — is issued server-side after payment is confirmed
 * (`DONATION_LOGIC_SPEC §2`). The number shown here is a preview, never an
 * allocated serial.
 *
 * `[RELIGIOUS-REVIEW]`: the project's aims, the definition of waqf, and the
 * certificate's legal text are reviewed translated content.
 */

const SHARE_PRICE = 100;
const METER_PRICE = 1500;

type WaqfUnit = "share" | "meter";

/** Areas of benefit, keyed to the same `homepage.waqfArea*` copy the homepage uses. */
const AID_TYPES: ReadonlyArray<{ key: string; icon: "book" | "water" | "bowl" | "home" | "heart" }> = [
  { key: "waqfArea3", icon: "book" },
  { key: "waqfArea4", icon: "book" },
  { key: "waqfArea5", icon: "book" },
  { key: "waqfArea6", icon: "water" },
  { key: "waqfArea9", icon: "bowl" },
  { key: "waqfArea1", icon: "home" },
  { key: "waqfArea2", icon: "heart" },
  { key: "waqfArea8", icon: "heart" },
];

const AID_ICONS: Record<string, ReactElement> = {
  book: (
    <>
      <path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13" />
      <path d="M8 7h9M8 11h9" />
    </>
  ),
  water: <path d="M12 3s6.5 7.1 6.5 12A6.5 6.5 0 0 1 5.5 15C5.5 10.1 12 3 12 3Z" />,
  bowl: (
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0Z" />
      <path d="M8 12V7a4 4 0 0 1 8 0v5" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  heart: <path d="M20.8 8.6c0 4.3-8.8 10.4-8.8 10.4S3.2 12.9 3.2 8.6a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z" />,
};

const FACTS = ["ongoing", "irrevocable", "dedicated", "certificate"] as const;
const GOALS = ["goal1", "goal2", "goal3", "goal4", "goal5", "goal6"] as const;
const PARTS = ["waqf-part-1", "waqf-part-2", "waqf-part-3", "waqf-part-4", "waqf-part-5", "waqf-part-6"] as const;
const FAQS = ["q1", "q2", "q3", "q4", "q5"] as const;

/** The introductory film is a separate recording per language edition. */
function waqfVideoSrc(locale: string): string {
  if (locale === "ar") return "https://www.youtube.com/embed/kdsphkfqq6Q";
  if (locale === "tr") return "https://www.youtube.com/embed/35aS9lTFsXs";
  return "https://www.youtube.com/embed/yPXKyaiNKU4";
}

export interface WaqfPageProps {
  /** Donor's name, when signed in, for the "use my name" shortcut. */
  donorName?: string | null;
}

export default function WaqfPage({ donorName }: WaqfPageProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("waqf");
  const tCommon = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tZakat = useTranslations("zakat");
  const tValidation = useTranslations("validation");
  const { format, formatNumber } = useMinbarMoney();

  const [unit, setUnit] = useState<WaqfUnit>("share");
  const [count, setCount] = useState(1);
  const [name, setName] = useState("");
  const [onBehalf, setOnBehalf] = useState("");
  const [monthly, setMonthly] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState(false);
  const [openFaq, setOpenFaq] = useState(-1);

  const unitPrice = unit === "meter" ? METER_PRICE : SHARE_PRICE;
  const total = unitPrice * count;

  /** Both names go on the certificate, so both are required before adding. */
  const validate = () => {
    const ok = name.trim().length > 0 && onBehalf.trim().length > 0;
    setError(!ok);
    return ok;
  };

  const buildItem = () => ({
    titleKey: unit === "meter" ? "unitMeter" : "unitShare",
    typeKey: "waqf" as const,
    freqKey: monthly ? ("monthly" as const) : ("once" as const),
    amount: total,
    currency: "USD",
  });

  const onAdd = () => {
    if (!validate()) return;
    addToCart(buildItem());
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  const onDonate = () => {
    if (!validate()) return;
    addToCart(buildItem());
    router.push(miaPath("cart", locale));
  };

  const onShare = async () => {
    const url = window.location.href.split("#")[0];
    if (navigator.share) await navigator.share({ title: t("qudsWaqfProjects"), url }).catch(() => {});
    else if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => {});
  };

  const inputStyle = (invalid: boolean): CSSProperties => ({
    height: 44,
    padding: "0 14px",
    borderRadius: 8,
    border: `1px solid ${invalid ? "var(--red)" : "var(--border)"}`,
    background: "#fff",
    fontFamily: "inherit",
    fontSize: 14.5,
    fontWeight: 800,
    color: "var(--deep)",
    boxSizing: "border-box",
    width: "100%",
  });

  return (
    <div style={{ position: "relative" }}>
      {/* ── Hero + unit picker ───────────────────────────────────────────── */}
      <section id="about" style={{ position: "relative", background: "var(--ivory)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "54px 24px 0" }}>
          <div id="wq-hero" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,.85fr)", gap: 46, alignItems: "center" }}>
            <div style={{ display: "grid", gap: 18, justifyItems: "start" }}>
              <h1 style={{ margin: 0, fontSize: "clamp(32px,3.8vw,50px)", lineHeight: 1.28, fontWeight: 900 }}>{t("qudsWaqfProjects")}</h1>
              <p style={{ margin: 0, maxWidth: "62ch", fontSize: 16.5, lineHeight: 2.05, color: "var(--muted)" }}>{t("meterIntro")}</p>
            </div>
            <span style={{ display: "block", maxWidth: 380, justifySelf: "end" }}>
              <img src="/minbar/assets/waqf-meter-intro.png" alt={t("qudsWaqfProjects")} style={{ display: "block", width: "100%", height: "auto" }} />
            </span>
          </div>

          <div id="meter-picker" style={{ marginTop: 46, paddingBottom: 56, display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 40, alignItems: "start", paddingInline: 34, paddingTop: 34, background: "#fff", border: "1px solid var(--border)", borderInlineStart: "3px solid var(--gold)" }}>
            <div style={{ display: "grid", gap: 16, paddingBottom: 34 }}>
              <b style={{ fontSize: 18 }}>{t("chooseUnit")}</b>

              <div style={{ display: "flex", gap: 8 }}>
                {(["share", "meter"] as WaqfUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-pick={unit === u ? "1" : ""}
                    onClick={() => setUnit(u)}
                    style={{ flex: "1 1 0", height: 44, padding: "0 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "1px solid var(--border)", background: "#fff", color: "var(--muted)", transition: "all .18s ease" }}
                  >
                    {u === "share" ? t("unitShare") : t("unitMeter")}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "var(--deep)" }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v10M9.5 9.5c0-1.2 1-2 2.5-2s2.5.9 2.5 2c0 2.5-5 1.8-5 4.2 0 1.1 1 2.1 2.5 2.1s2.5-.8 2.5-2" />
                  </svg>
                  {unit === "meter" ? t("meterPrice") : t("sharePrice")}
                </span>
                <b dir="ltr" style={{ fontSize: 19, fontWeight: 900, unicodeBidi: "isolate", color: "var(--deep)" }}>
                  {format(unitPrice)}
                </b>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--muted)" }}>
                  {unit === "meter" ? t("meterCount") : t("shareCount")}
                </span>
                {/* A counter, not a free amount — the unit price is fixed. */}
                <span dir="ltr" style={{ display: "inline-flex", alignItems: "stretch", border: "1px solid var(--border)", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
                  <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="−" className="wq-step" style={stepBtn}>
                    −
                  </button>
                  <b style={{ minWidth: 34, display: "grid", placeItems: "center", textAlign: "center", fontSize: 15.5, fontWeight: 900, borderInline: "1px solid var(--border)", fontVariantNumeric: "tabular-nums", padding: "0 4px" }}>
                    {formatNumber(count)}
                  </b>
                  <button type="button" onClick={() => setCount((c) => c + 1)} aria-label="+" className="wq-step" style={stepBtn}>
                    +
                  </button>
                </span>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--muted)" }}>{t("certName")}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} className="wq-input" style={inputStyle(error && !name.trim())} />
                {donorName && !name ? (
                  <button type="button" onClick={() => setName(donorName)} className="wq-link" style={linkBtn}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {tCommon("add")}
                  </button>
                ) : null}
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--muted)" }}>{t("endowedOnBehalfOf")}</span>
                <input value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)} placeholder={t("onBehalfPlaceholder")} className="wq-input" style={inputStyle(error && !onBehalf.trim())} />
                <button type="button" onClick={() => setOnBehalf(name || donorName || "")} className="wq-link" style={linkBtn}>
                  {t("suggestSelf")}
                </button>
              </label>

              {error ? (
                <div className="wq-error" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "rgba(169,52,40,.08)", border: "1px solid rgba(169,52,40,.3)", color: "var(--red)", fontSize: 13, fontWeight: 800 }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  {tValidation("required")}
                </div>
              ) : null}

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted)", letterSpacing: ".06em" }}>{tCommon("total")}</span>
                <b dir="ltr" style={{ fontSize: 26, unicodeBidi: "isolate" }}>
                  {format(total)}
                </b>
              </div>

              <button
                type="button"
                onClick={() => setMonthly((v) => !v)}
                aria-pressed={monthly}
                className="wq-monthly"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${monthly ? "var(--green)" : "var(--border)"}`,
                  background: monthly ? "rgba(31,122,77,.06)" : "#fff",
                  color: monthly ? "var(--green)" : "var(--muted)",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: "pointer",
                  transition: "all .18s ease",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 2v4H7a4 4 0 0 0-4 4M7 22v-4h10a4 4 0 0 0 4-4" />
                  </svg>
                  {tCommon("monthly")}
                </span>
                <span aria-hidden="true" style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: monthly ? "flex-end" : "flex-start", width: 40, height: 22, padding: 3, borderRadius: 999, background: monthly ? "var(--green)" : "rgba(16,33,43,.18)", transition: "background .2s ease" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                </span>
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={onAdd}
                  style={{
                    flex: "1 1 0",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    height: 50,
                    borderRadius: 8,
                    border: `1px solid ${added ? "var(--green)" : "var(--border)"}`,
                    background: added ? "rgba(31,122,77,.08)" : "#fff",
                    color: added ? "var(--green)" : "var(--deep)",
                    fontFamily: "inherit",
                    fontWeight: 900,
                    fontSize: 14.5,
                    cursor: "pointer",
                    transition: "all .18s ease",
                  }}
                >
                  {added ? (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      <path d="M12 8v4M10 10h4" />
                    </svg>
                  )}
                  {added ? tCommon("addedToCart") : tCommon("addToCart")}
                </button>
                <button type="button" onClick={onDonate} className="mia-card-cta" style={{ flex: "1 1 0", height: 50, border: 0, borderRadius: 8, background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "var(--shadow-cta)", transition: "filter .18s ease" }}>
                  {tCommon("donateNow")}
                </button>
              </div>

              <button type="button" onClick={onShare} className="wq-link" style={{ ...linkBtn, justifySelf: "start" }}>
                {tCommon("sharePage")}
              </button>
            </div>

            <WaqfCertificatePreview unit={unit} count={count} total={format(total)} name={name} onBehalf={onBehalf} />
          </div>
        </div>
      </section>

      {/* ── Introductory film ────────────────────────────────────────────── */}
      <section id="video" style={{ background: "transparent", padding: "46px 0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <div id="waqf-video-card" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 0, background: "var(--deep)", border: "1px solid rgba(211,154,39,.5)", borderRadius: 12, overflow: "hidden" }}>
            <div className="wv-head" style={{ position: "relative", display: "grid", gap: 14, alignContent: "center", padding: 40, justifyItems: "start" }}>
              <div aria-hidden="true" data-aqsa-pattern="" style={{ ...pattern(520), opacity: 0.09 }} />
              <h2 style={{ position: "relative", margin: 0, fontSize: "clamp(22px,2.4vw,32px)", lineHeight: 1.35, fontWeight: 900, color: "#fff" }}>{t("videoTitle")}</h2>
            </div>
            <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#000", overflow: "hidden" }}>
              <iframe
                src={waqfVideoSrc(locale)}
                title={t("videoTitle")}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── What waqf is ─────────────────────────────────────────────────── */}
      <section id="what-is-waqf" style={{ background: "var(--sand)", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div id="whatiswaqf-grid" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 40, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.3, fontWeight: 900, color: "var(--red)" }}>{t("whatIsWaqf")}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 2.05, color: "var(--muted)" }}>{t("whatIsWaqfText")}</p>
            <span style={{ marginTop: 6 }}>
              <Button variant="gold" href="#about-detail" style={{ whiteSpace: "nowrap" }}>
                {t("learnMore")}
              </Button>
            </span>
          </div>
          <div id="wq-facts" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 20 }}>
            {FACTS.map((id) => (
              <div key={id} className="mia-lift" style={{ background: "#fff", borderRadius: 14, padding: 24, display: "grid", gap: 10, alignContent: "start", borderTop: "3px solid var(--gold)" }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "var(--red)" }}>{t(`fact_${id}`)}</h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.85, color: "var(--muted)" }}>{t(`factDesc_${id}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The project in detail ────────────────────────────────────────── */}
      <section id="about-detail" style={{ background: "#fff", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gap: 24 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.25, fontWeight: 900 }}>{t("aboutMeter")}</h2>
          <div id="wq-detail" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, alignItems: "stretch" }}>
            <article style={detailCard("var(--ivory)", "var(--deep)")}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "var(--deep)" }}>{t("aboutIdea")}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: "var(--muted)" }}>{t("meterText1")}</p>
            </article>
            <article style={detailCard("var(--ivory)", "var(--deep)")}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "var(--deep)" }}>{t("aboutCost")}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: "var(--muted)" }}>{t("meterText2")}</p>
            </article>
            <article style={{ ...detailCard("var(--sand)", "var(--gold)"), border: "1px solid rgba(211,154,39,.4)" }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--gold)", letterSpacing: ".06em" }}>{t("unitShare")}</span>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 2, color: "var(--deep)" }}>{t("meterText3")}</p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Areas of benefit ─────────────────────────────────────────────── */}
      <section id="aid-types" style={{ position: "relative", background: "var(--red)", padding: "62px 0" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={{ ...pattern(420), opacity: 0.08 }} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.25, fontWeight: 900, color: "#fff" }}>{t("aidTypes")}</h2>
          <p style={{ margin: "0 0 30px", maxWidth: "76ch", color: "rgba(255,255,255,.82)", fontSize: 15.5, lineHeight: 1.9 }}>{t("aidTypesText")}</p>
          <div id="wq-aid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
            {AID_TYPES.map((aid) => (
              <div key={aid.key} className="wq-aid-card" style={{ border: "1px solid rgba(255,255,255,.22)", borderRadius: 12, padding: "26px 18px", display: "grid", justifyItems: "center", gap: 12, textAlign: "center", background: "rgba(255,255,255,.05)", transition: "all .2s cubic-bezier(.22,.61,.36,1)" }}>
                <span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(211,154,39,.18)", display: "grid", placeItems: "center", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {AID_ICONS[aid.icon]}
                  </svg>
                </span>
                <b style={{ color: "#fff", fontSize: 15, fontWeight: 800, lineHeight: 1.5 }}>{tHome(aid.key)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Aims ─────────────────────────────────────────────────────────── */}
      <section id="goals" style={{ background: "var(--sand)", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 26px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.25, fontWeight: 900 }}>{t("projectGoals")}</h2>
          <div id="wq-goals" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20 }}>
            {GOALS.map((id, i) => (
              <div key={id} className="mia-lift" style={{ background: "#fff", borderRadius: 12, padding: 24, display: "grid", gap: 12, alignContent: "start", boxShadow: "0 8px 20px rgba(16,33,43,.06)" }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--gold)", color: "#10212B", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 14 }}>
                  {formatNumber(i + 1)}
                </span>
                <p style={{ margin: 0, color: "var(--deep)", fontSize: 14.5, lineHeight: 1.95 }}>{t(id)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Where the yield goes ─────────────────────────────────────────── */}
      <section id="parts" style={{ background: "#fff", padding: "62px 0", borderBlock: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.2, fontWeight: 900 }}>{t("projectParts")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "76ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("partsText")}</p>
          <div id="wq-parts" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18 }}>
            {PARTS.map((id) => (
              <div key={id} className="wq-part" style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "var(--sand)", border: "1px solid var(--border)", padding: 22, display: "grid", gap: 8, alignContent: "start", transition: "transform .2s cubic-bezier(.22,.61,.36,1)" }}>
                <b style={{ display: "block", fontSize: 15.5, lineHeight: 1.35, color: "var(--deep)" }}>{t(`part_${id}`)}</b>
                <span style={{ display: "block", color: "var(--muted)", fontSize: 12.5, lineHeight: 1.7 }}>{t(`partDesc_${id}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: "#fff", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 18px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.2, fontWeight: 900 }}>{t("waqfFaq")}</h2>
          <div style={{ display: "grid", borderTop: "1px solid var(--border)" }}>
            {FAQS.map((id, i) => {
              const open = openFaq === i;
              return (
                <div key={id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    aria-expanded={open}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "18px 0", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 16, fontWeight: 800, color: "var(--deep)", textAlign: "start" }}
                  >
                    {t(`faq_${id}`)}
                    <span aria-hidden="true" style={{ marginInlineStart: "auto", color: "var(--gold)", fontSize: 18 }}>
                      {open ? "−" : "+"}
                    </span>
                  </button>
                  <div style={{ maxHeight: open ? 500 : 0, opacity: open ? 1 : 0, padding: open ? "0 0 18px" : 0, overflow: "hidden", color: "var(--muted)", fontSize: 15, lineHeight: 1.9, transition: "all .3s cubic-bezier(.22,.61,.36,1)" }}>
                    {t(`faqA_${id}`)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section id="waqf-cta" style={{ position: "relative", background: "var(--deep)", padding: "56px 0", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={{ ...pattern(520), opacity: 0.09 }} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 10, flex: "1 1 460px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px,2.7vw,36px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("legacyEyebrow")}</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,.8)", fontSize: 16, lineHeight: 1.9 }}>{t("meterIntro")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" href="#meter-picker" style={{ whiteSpace: "nowrap" }}>
              {t("donateWaqf")}
            </Button>
            <Button variant="outline" size="lg" href={miaPath("zakat", locale)} style={{ whiteSpace: "nowrap" }}>
              {tZakat("zakatPage")}
            </Button>
          </div>
        </div>
      </section>

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}

const stepBtn: CSSProperties = {
  width: 36,
  height: 38,
  border: 0,
  background: "transparent",
  color: "var(--deep)",
  fontSize: 18,
  fontWeight: 800,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  transition: "background .15s ease",
  fontFamily: "inherit",
};

const linkBtn: CSSProperties = {
  justifySelf: "start",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: 0,
  padding: "2px 0",
  color: "var(--gold)",
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
};

const detailCard = (background: string, accent: string): CSSProperties => ({
  background,
  border: "1px solid var(--border)",
  borderTop: `3px solid ${accent}`,
  borderRadius: 12,
  padding: 26,
  display: "grid",
  gap: 10,
  alignContent: "start",
  margin: 0,
});

const pattern = (size: number): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
  backgroundRepeat: "repeat",
  backgroundSize: `${size}px ${size}px`,
  opacity: 0.05,
  pointerEvents: "none",
});
