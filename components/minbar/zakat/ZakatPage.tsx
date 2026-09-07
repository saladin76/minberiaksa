"use client";

import { useState, type CSSProperties, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";
import { ArrowGlyph } from "@/components/minbar/home/TopSections";

/**
 * Zakat landing page — ported from `Minbar/الزكاة.dc.html`.
 *
 * A quick-give hero, a collapsible four-field estimator, the case for directing
 * zakat to Palestine, the eight categories of recipients, two scholars'
 * testimonies on expediting zakat, two videos, and an FAQ.
 *
 * `[RELIGIOUS-REVIEW]`: the eight masārif and both testimonies are translated
 * content under religious review. The Qur'anic verse (At-Tawbah 60) is rendered
 * in Arabic in every language edition, as the handoff requires.
 *
 * Zakat is kept separate from every other kind of giving: items added here
 * carry `typeKey: "zakat"`, which is what keeps it separated in the cart, on the
 * receipt, and in how it is disbursed.
 */

/** The eight categories, with the icon each carries in the design. */
const MASARIF: ReadonlyArray<{ id: string; icon: string }> = [
  { id: "fuqara", icon: "hand-heart" },
  { id: "masakin", icon: "users" },
  { id: "amilin", icon: "briefcase" },
  { id: "muallafa", icon: "heart-handshake" },
  { id: "riqab", icon: "unlock" },
  { id: "gharimin", icon: "scale" },
  { id: "sabilillah", icon: "flag" },
  { id: "ibnsabil", icon: "route" },
];

const MASARIF_ICONS: Record<string, ReactElement> = {
  "hand-heart": <path d="M12 20s-6.5-4-8.5-7.5C2 10 3 7 6 7c1.6 0 2.9.8 3.5 2 .6-1.2 1.9-2 3.5-2 3 0 4.5 3 3.5 6.5C15.7 16.5 12 20 12 20Z" />,
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  "heart-handshake": (
    <>
      <path d="M12 20s-6.5-4-8.5-7.5C2 10 3 7 6 7c1.6 0 2.9.8 3.5 2 .6-1.2 1.9-2 3.5-2 3 0 4.5 3 3.5 6.5C15.7 16.5 12 20 12 20Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  unlock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18" />
      <path d="M5 7h5l-2.5 6.5a3 3 0 0 0 5 0L10 7" />
      <path d="M14 7h5l-2.5 6.5a3 3 0 0 0 5 0L19 7" />
      <path d="M5 7l7-2 7 2" />
    </>
  ),
  flag: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h14l-2.5 4L18 12H4" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M18 7v6a4 4 0 0 1-4 4H8" />
    </>
  ),
};

/** Quick-estimator fields: three asset groups minus liabilities. */
const QUICK_FIELDS = [
  { id: "cash", labelKey: "qcCash", icon: "wallet", color: "var(--deep)" },
  { id: "gold", labelKey: "qcGold", icon: "gem", color: "var(--gold)" },
  { id: "trade", labelKey: "qcTrade", icon: "trending-up", color: "var(--deep)" },
  { id: "debts", labelKey: "qcDebts", icon: "receipt", color: "var(--red)" },
] as const;

const FIELD_ICONS: Record<string, ReactElement> = {
  wallet: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </>
  ),
  gem: (
    <>
      <path d="M6 3h12l3 5-9 13L3 8Z" />
      <path d="M3 8h18" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M3 17l6-6 4 4 7-8" />
      <path d="M15 6h5v5" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 3h10l2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5l2-2Z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
};

/**
 * The zakat FAQ. These are the foundation's own reviewed answers, already
 * translated ×19 in the `zakat` bundle and shared with the detailed calculator.
 * The handoff's page took them from `props.faqs` with no fallback so no
 * placeholder could ship; reusing the reviewed set keeps the section real
 * without inventing anything, and the dashboard can still override it.
 */
const FAQS = ["hawl", "metal", "salary", "jewelry", "early", "channels"] as const;

const QUICK_AMOUNTS = [1000, 2000, 3000, 5000];
const ZAKAT_RATE = 0.025;

export interface ZakatPageProps {
  videoUrl1?: string;
  videoUrl2?: string;
}

export default function ZakatPage({
  videoUrl1 = "https://www.youtube.com/embed/kBXI352bX-g",
  videoUrl2 = "https://www.youtube.com/embed/4b5FMrMn0MM",
}: ZakatPageProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("zakat");
  const tCommon = useTranslations("common");
  const { format } = useMinbarMoney();

  const [amount, setAmount] = useState(QUICK_AMOUNTS[0]);
  const [heroCustom, setHeroCustom] = useState("");
  const [added, setAdded] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [openFaq, setOpenFaq] = useState(-1);

  const num = (x: string | undefined) => {
    const v = Number.parseFloat(String(x ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(v) ? v : 0;
  };
  const base = Math.max(0, num(values.cash) + num(values.gold) + num(values.trade) - num(values.debts));
  const due = base * ZAKAT_RATE;
  const heroAmount = heroCustom ? num(heroCustom) : amount;

  /** Every add from this page is zakat — that is what keeps it ring-fenced. */
  const addZakat = (value: number) =>
    addToCart({ titleKey: "zakatToPalestine", typeKey: "zakat", freqKey: "once", amount: value, currency: "USD" });

  const onDonateNow = () => {
    if (!(heroAmount > 0)) return;
    addZakat(heroAmount);
    router.push(miaPath("cart", locale));
  };

  const onAddToCart = () => {
    if (!(heroAmount > 0)) return;
    addZakat(heroAmount);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  const onDonateCalculated = () => {
    if (!(base > 0)) return;
    addZakat(Math.round(due));
    router.push(miaPath("cart", locale));
  };

  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: t("heroTitle"), url }).catch(() => {});
    else if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div style={{ position: "relative" }}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "#fff", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
        <div id="zk-hero-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "54px 24px 56px", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,.55fr)", gap: 30, alignItems: "center" }}>
          <div style={{ display: "grid", gap: 18, justifyItems: "start", maxWidth: 640 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,50px)", lineHeight: 1.3, fontWeight: 900 }}>{t("heroTitle")}</h1>

            <div id="zk-amounts" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-pick={amount === value && !heroCustom ? "1" : ""}
                  onClick={() => {
                    setAmount(value);
                    setHeroCustom("");
                  }}
                  className="zk-amt"
                  style={{ height: 46, padding: "0 22px", cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 800, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", color: "var(--muted)", transition: "all .18s ease" }}
                >
                  <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                    {format(value)}
                  </span>
                </button>
              ))}
              <input
                value={heroCustom}
                onChange={(e) => setHeroCustom(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder={tCommon("customAmount")}
                aria-label={tCommon("customAmount")}
                className="zk-input"
                style={{ height: 46, width: 140, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 800, color: "var(--deep)", boxSizing: "border-box", transition: "border-color .18s ease" }}
              />
            </div>

            <div id="zk-ctas" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button type="button" onClick={onDonateNow} className="zk-donate" style={{ height: 54, padding: "0 30px", border: 0, borderRadius: 999, cursor: "pointer", background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 15, boxShadow: "0 8px 20px rgba(169,52,40,.24)", whiteSpace: "nowrap", transition: "all .2s cubic-bezier(.22,.61,.36,1)" }}>
                {tCommon("donateNow")}
              </button>
              <button
                type="button"
                onClick={onAddToCart}
                className="zk-cart"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 54,
                  padding: "0 26px",
                  border: added ? "1px solid var(--green)" : "1.5px solid var(--deep)",
                  borderRadius: 999,
                  cursor: "pointer",
                  background: added ? "var(--green)" : "#fff",
                  color: added ? "#fff" : "var(--deep)",
                  fontFamily: "inherit",
                  fontWeight: 900,
                  fontSize: 15,
                  whiteSpace: "nowrap",
                  transition: "all .2s cubic-bezier(.22,.61,.36,1)",
                }}
              >
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="20" r="1.4" />
                    <circle cx="17" cy="20" r="1.4" />
                    <path d="M3 4h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20 8H6" />
                  </svg>
                </span>
                {added ? tCommon("addedToCart") : tCommon("addToCart")}
              </button>
              <button type="button" onClick={onShare} title={tCommon("sharePage")} aria-label={tCommon("sharePage")} className="zk-share" style={{ flex: "0 0 auto", width: 54, height: 54, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 999, background: "#fff", color: "var(--deep)", cursor: "pointer", transition: "all .18s ease" }}>
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 10.6 6.8-3.8M8.6 13.4l6.8 3.8" />
                </svg>
              </button>
            </div>
          </div>

          <span style={{ display: "block", maxWidth: 380, justifySelf: "end" }}>
            <img src="/minbar/assets/zakat-hero-coins.png" alt={t("heroTitle")} style={{ display: "block", width: "100%", height: "auto" }} />
          </span>
        </div>
      </section>

      {/* ── Quick estimator ──────────────────────────────────────────────── */}
      <section id="calculator" style={{ background: "#fff", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <div className="zk-card" style={{ position: "relative", overflow: "hidden", borderRadius: 22, background: "linear-gradient(180deg, var(--ivory), #fff)", border: "1px solid var(--border)", boxShadow: "0 26px 60px rgba(16,33,43,.09)", padding: 34, display: "grid", gap: 26 }}>
            <span aria-hidden="true" style={{ position: "absolute", insetInline: 0, top: 0, height: 4, background: "linear-gradient(90deg, var(--green), var(--gold))" }} />

            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 14, background: "rgba(31,122,77,.1)", color: "var(--green)" }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="18" height="12" rx="2.4" />
                    <path d="M3 10.5h18M8 15h2.4" />
                    <circle cx="16" cy="15" r="1.3" />
                  </svg>
                </span>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "clamp(24px,2.6vw,32px)", lineHeight: 1.2, fontWeight: 900 }}>{tCommon("zakatCalculator")}</h2>
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: 14.5, lineHeight: 1.7 }}>{t("calcIntroText")}</p>
                </div>
              </div>

              <button type="button" onClick={() => setValues({})} className="zk-reset" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: 0, color: "var(--muted)", fontFamily: "inherit", fontWeight: 800, fontSize: 13.5, padding: "8px 4px", cursor: "pointer", transition: "color .18s ease" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
                {t("reset")}
              </button>

              <button
                type="button"
                onClick={() => setCalcOpen((v) => !v)}
                aria-expanded={calcOpen}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 999, border: "1px solid var(--green)", background: calcOpen ? "var(--green)" : "#fff", color: calcOpen ? "#fff" : "var(--green)", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: "pointer", transition: "all .2s ease" }}
              >
                {calcOpen ? t("collapseCalculator") : t("openCalculator")}
                <span aria-hidden="true" style={{ display: "inline-flex", transition: "transform .25s ease", transform: calcOpen ? "rotate(180deg)" : undefined }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
            </div>

            {calcOpen ? (
              <>
                <div id="zk-quick-fields" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 }}>
                  {QUICK_FIELDS.map((field) => (
                    <label key={field.id} className="zk-field" style={{ display: "grid", gap: 12, padding: 18, background: "#fff", border: "1px solid var(--border)", borderRadius: 16, transition: "border-color .18s ease, box-shadow .18s ease, transform .18s ease" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: `color-mix(in srgb, ${field.color} 12%, transparent)`, color: field.color }}>
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            {FIELD_ICONS[field.icon]}
                          </svg>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--deep)" }}>{t(field.labelKey)}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, background: "var(--ivory)", border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px", boxSizing: "border-box" }}>
                        <span dir="ltr" style={{ flex: "0 0 auto", color: "var(--muted)", fontWeight: 900, fontSize: 15 }}>
                          $
                        </span>
                        <input
                          value={values[field.id] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={t(field.labelKey)}
                          style={{ flex: "1 1 0", width: "100%", minWidth: 0, boxSizing: "border-box", minHeight: 44, border: 0, background: "transparent", fontFamily: "inherit", fontWeight: 800, fontSize: 16, color: "var(--deep)" }}
                        />
                      </span>
                    </label>
                  ))}
                </div>

                <div id="zk-result" style={{ position: "relative", overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", alignItems: "center", gap: 24, padding: "26px 28px", background: "linear-gradient(120deg, rgba(31,122,77,.1), rgba(211,154,39,.08))", border: "1px solid rgba(31,122,77,.3)", borderRadius: 18 }}>
                  <span aria-hidden="true" style={{ position: "absolute", insetInlineEnd: -50, top: -50, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(211,154,39,.16), transparent 70%)", pointerEvents: "none" }} />
                  <span style={{ position: "relative", display: "grid", gap: 4 }}>
                    <span style={micro}>{t("netZakatWealth")}</span>
                    <b dir="ltr" style={{ fontSize: 24, color: "var(--deep)", unicodeBidi: "isolate" }}>
                      {format(base)}
                    </b>
                  </span>
                  <span style={{ position: "relative", display: "grid", gap: 4, paddingInlineStart: 24, borderInlineStart: "1px solid rgba(31,122,77,.28)" }}>
                    <span style={{ ...micro, color: "var(--green)" }}>{t("zakatDueLabel")}</span>
                    <b dir="ltr" style={{ fontSize: 32, color: "var(--green)", unicodeBidi: "isolate" }}>
                      {format(due)}
                    </b>
                  </span>
                  <span style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={onDonateCalculated}
                      disabled={!(base > 0)}
                      className="zk-donate-calc"
                      style={{
                        height: 48,
                        padding: "0 26px",
                        border: 0,
                        borderRadius: 999,
                        cursor: base > 0 ? "pointer" : "not-allowed",
                        background: base > 0 ? "var(--green)" : "var(--border)",
                        color: base > 0 ? "#fff" : "var(--muted)",
                        fontFamily: "inherit",
                        fontWeight: 900,
                        fontSize: 14.5,
                        whiteSpace: "nowrap",
                        transition: "all .2s cubic-bezier(.22,.61,.36,1)",
                        boxShadow: base > 0 ? "0 10px 22px rgba(31,122,77,.28)" : "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {t("donateZakatNowArrow")}
                      <ArrowGlyph />
                    </button>
                  </span>
                </div>

                <p style={{ margin: 0, color: "var(--muted)", fontSize: 12.5, lineHeight: 1.8 }}>{t("calcFootnote")}</p>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Why Palestine ────────────────────────────────────────────────── */}
      <TwoColumn
        id="why"
        background="transparent"
        image="/minbar/assets/zakat-balance.png"
        imageFirst={false}
        heading={t("whyPalestine")}
        text={t("whyText")}
      />

      {/* ── The reward ───────────────────────────────────────────────────── */}
      <TwoColumn
        id="reward"
        background="var(--sand)"
        image="/minbar/assets/zakat-tree.png"
        imageFirst
        heading={t("rewardTitle")}
        text={t("rewardText")}
      />

      {/* ── The eight categories ─────────────────────────────────────────── */}
      <section id="masarif" style={{ background: "#fff", padding: "62px 0", borderBlock: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <div id="masarif-head" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,.85fr)", gap: 40, alignItems: "center", marginBottom: 30 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.2, fontWeight: 900 }}>{t("masarifTitle")}</h2>
              <p style={{ margin: 0, maxWidth: "60ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("masarifSubtext")}</p>
            </div>
            <span style={{ display: "block", maxWidth: 300, justifySelf: "end" }}>
              <img src="/minbar/assets/zakat-eight-masarif.png" alt={t("masarifTitle")} style={{ display: "block", width: "100%", height: "auto" }} />
            </span>
          </div>

          <p style={{ margin: "0 0 26px", maxWidth: "76ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>
            {t("masarifIntro")}{" "}
            {/* At-Tawbah 60. Arabic in every language edition, isolated so bidi
                cannot reorder it inside a left-to-right paragraph. */}
            <span dir="rtl" lang="ar" style={{ unicodeBidi: "isolate", fontWeight: 800, color: "var(--deep)", fontFamily: "var(--font-quran)" }}>
              ﴿إِنَّمَا الصَّدَقَاتُ لِلْفُقَرَاءِ وَالْمَسَاكِينِ وَالْعَامِلِينَ عَلَيْهَا وَالْمُؤَلَّفَةِ قُلُوبُهُمْ وَفِي الرِّقَابِ وَالْغَارِمِينَ وَفِي سَبِيلِ اللَّهِ وَابْنِ السَّبِيلِ﴾
            </span>{" "}
            — {t("masarifAyahRef")}.
          </p>

          <div id="masarif-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "22px 16px" }}>
            {MASARIF.map((item, i) => (
              <div key={item.id} className="zk-masraf" style={{ position: "relative", overflow: "hidden", padding: "22px 18px", background: "var(--deep)", borderRadius: 14, display: "grid", gap: 12, transition: "transform .2s ease, box-shadow .2s ease" }}>
                <span aria-hidden="true" style={{ position: "absolute", top: 10, insetInlineEnd: 14, fontSize: 34, fontWeight: 900, color: "rgba(255,255,255,.14)", lineHeight: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ width: 52, height: 52, borderRadius: 13, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", color: "var(--gold)" }}>
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {MASARIF_ICONS[item.icon]}
                  </svg>
                </span>
                <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <b style={{ fontSize: 16, color: "#fff" }}>{t(`masraf_${item.id}`)}</b>
                  <span style={{ color: "rgba(255,255,255,.82)", fontSize: 12.5, lineHeight: 1.7 }}>{t(`masrafDesc_${item.id}`)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Expediting zakat, and the two testimonies ────────────────────── */}
      <section id="taajil" style={{ background: "#fff", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <Testimony
            quote={t("testimonial1Quote")}
            name={t("testimonial1Name")}
            title={t("scholarTitle")}
            image="/minbar/assets/sheikh-ali-qaradaghi.jpg"
            style={{ marginBottom: 54 }}
          />

          <div id="taajil-main" style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 36, alignItems: "center", marginBottom: 44 }}>
            <span style={{ display: "block", width: "clamp(170px, 22vw, 250px)" }}>
              <img src="/minbar/assets/zakat-hourglass.png" alt={t("expediteTitle")} style={{ display: "block", width: "100%", height: "auto" }} />
            </span>
            <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
              <h2 style={{ margin: 0, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.25, fontWeight: 900 }}>{t("expediteTitle")}</h2>
              <div style={{ width: 64, height: 3, background: "var(--gold)", borderRadius: 2 }} />
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 15.5, lineHeight: 1.95 }}>{t("expediteText")}</p>
            </div>
          </div>

          <Testimony
            heading={t("expediteNeed")}
            quote={t("testimonial2Quote")}
            name={t("testimonial2Name")}
            title={t("muftiTitle")}
            image="/minbar/assets/sheikh-ikrima-sabri.jpg"
          />
        </div>
      </section>

      {/* ── Videos ───────────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", padding: "62px 0", borderBottom: "1px solid var(--border)" }}>
        <div id="zk-videos" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 24 }}>
          {[videoUrl1, videoUrl2].map((url) => (
            <div key={url} style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", boxShadow: "0 18px 50px rgba(16,33,43,.14)" }}>
              <iframe
                src={url}
                title={t("heroTitle")}
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ position: "relative", background: "var(--sand)", padding: "62px 0", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 18px", fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1.2, fontWeight: 900 }}>{t("faqTitle")}</h2>
          <div style={{ display: "grid", borderTop: "1px solid var(--border)", background: "#fff", maxWidth: 900 }}>
            {FAQS.map((id, i) => {
              const open = openFaq === i;
              return (
                <div key={id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : i)}
                    aria-expanded={open}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: 18, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 16, fontWeight: 800, color: "var(--deep)", textAlign: "start" }}
                  >
                    {t(`faq_${id}_q`)}
                    <span aria-hidden="true" style={{ marginInlineStart: "auto", color: "var(--gold)", fontSize: 18 }}>
                      {open ? "−" : "+"}
                    </span>
                  </button>
                  <div style={{ maxHeight: open ? 500 : 0, opacity: open ? 1 : 0, padding: open ? "0 18px 18px" : "0 18px", overflow: "hidden", color: "var(--muted)", fontSize: 15, lineHeight: 1.85, transition: "all .3s cubic-bezier(.22,.61,.36,1)" }}>
                    {t(`faq_${id}_a`)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--deep)", padding: "56px 0", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={{ ...pattern(520), opacity: 0.1 }} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 10, flex: "1 1 460px", minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(24px,2.7vw,36px)", lineHeight: 1.3, fontWeight: 900, color: "#fff" }}>{t("ctaTitle")}</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,.8)", fontSize: 16, lineHeight: 1.9 }}>{t("ctaText")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" href="#calculator" style={{ whiteSpace: "nowrap" }}>
              {t("donateZakatNowArrow")}
            </Button>
            <Button variant="outline" size="lg" href={miaPath("waqf", locale)} style={{ whiteSpace: "nowrap" }}>
              {t("allWaqfProjects")}
            </Button>
          </div>
        </div>
      </section>

      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}

/** Image-and-copy band, mirrored by `imageFirst`. */
function TwoColumn({
  id,
  background,
  image,
  imageFirst,
  heading,
  text,
}: {
  id: string;
  background: string;
  image: string;
  imageFirst: boolean;
  heading: string;
  text: string;
}) {
  const copy = (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.2, fontWeight: 900 }}>{heading}</h2>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 16, lineHeight: 2 }}>{text}</p>
    </div>
  );
  const picture = (
    <span style={{ display: "block", maxWidth: 340, marginInlineStart: imageFirst ? undefined : "auto" }}>
      <img src={image} alt="" style={{ display: "block", width: "100%", height: "auto" }} />
    </span>
  );

  return (
    <section id={id} style={{ position: "relative", background, padding: "62px 0", borderBottom: background === "transparent" ? undefined : "1px solid var(--border)", overflow: "hidden" }}>
      <div aria-hidden="true" data-aqsa-pattern="" style={pattern(520)} />
      <div className="zk-two-col" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: imageFirst ? "minmax(0,.85fr) minmax(0,1fr)" : "minmax(0,1fr) minmax(0,.85fr)", gap: 40, alignItems: "center" }}>
        {imageFirst ? picture : copy}
        {imageFirst ? copy : picture}
      </div>
    </section>
  );
}

/** A scholar's testimony with attribution. */
function Testimony({
  heading,
  quote,
  name,
  title,
  image,
  style,
}: {
  heading?: string;
  quote: string;
  name: string;
  title: string;
  image: string;
  style?: CSSProperties;
}) {
  return (
    <blockquote style={{ margin: 0, position: "relative", padding: "34px 40px", background: "var(--sand)", borderInlineStart: "3px solid var(--gold)", display: "grid", gap: 14, maxWidth: 760, ...style }}>
      {heading ? <h3 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: "var(--deep)" }}>{heading}</h3> : null}
      <p style={{ margin: 0, fontSize: heading ? 15.5 : 17, lineHeight: heading ? 1.95 : 2, color: heading ? "var(--muted)" : "var(--deep)" }}>{quote}</p>
      <footer style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src={image} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)", flex: "0 0 auto" }} />
        <span style={{ display: "grid", gap: 2 }}>
          <b style={{ color: "var(--green)", fontSize: 15, fontWeight: 900 }}>{name}</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{title}</span>
        </span>
      </footer>
    </blockquote>
  );
}

const micro: CSSProperties = { fontSize: 11, fontWeight: 900, color: "var(--muted)", letterSpacing: ".06em" };

const pattern = (size: number): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
  backgroundRepeat: "repeat",
  backgroundSize: `${size}px ${size}px`,
  opacity: 0.05,
  pointerEvents: "none",
});
