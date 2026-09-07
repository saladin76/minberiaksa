"use client";

import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import TravelBanner from "@/components/minbar/banners/TravelBanner";

/**
 * Zakat calculator — ported from `Minbar/حاسبة الزكاة.dc.html`.
 *
 * The calculation, exactly as the handoff specifies:
 *   assets = cash + metals + investments + trade goods
 *   net    = max(0, assets − liabilities)
 *   nisāb  = 85g gold, or 595g silver, at the rate the donor enters
 *   due    = net ≥ nisāb ? net × 2.5% : 0
 *
 * Karat is weighted by purity (21/24, 18/24) rather than counted at the 24k
 * rate, which would overstate the holding.
 *
 * `[RELIGIOUS-REVIEW]`: the fiqh copy — what is and is not zakatable, and the
 * FAQ — is translated content under religious review, not text this component
 * composes. Nothing here is a fatwa, and the page says so.
 *
 * `[BACKEND-INTEGRATION]`: the gold and silver rates are entered by the donor
 * today. `DEVELOPER_HANDOFF` lists a daily gold-price API as a required
 * integration; `rates` is the seam for it, and a supplied rate pre-fills the
 * field rather than replacing the donor's ability to override it.
 */

type NisabMode = "gold" | "silver";

/** Nisāb thresholds in grams. */
const GOLD_GRAMS = 85;
const SILVER_GRAMS = 595;
/** The zakat rate on wealth. */
const ZAKAT_RATE = 0.025;

/** Field ids, grouped as the design groups them. */
const FIELDS = {
  cash: ["cash", "bank", "savings", "loansOut"],
  gem: ["gold24", "gold21", "gold18", "silver"],
  invest: ["shares", "funds", "pension", "rentIncome"],
  trade: ["stock", "receivables", "cashBiz"],
  liabilities: ["debts", "bills", "salaries"],
} as const;


const GROUP_ICONS: Record<string, ReactElement> = {
  wallet: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M16 14h2" />
      <path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7" />
    </>
  ),
  gem: (
    <>
      <path d="M6 3h12l3 5-9 13L3 8Z" />
      <path d="M3 8h18M9 3l3 5-3 13M15 3l-3 5 3 13" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M3 17l6-6 4 4 7-8" />
      <path d="M15 6h5v5" />
    </>
  ),
  store: (
    <>
      <path d="M4 9V6l2-3h12l2 3v3" />
      <path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M5 9v10h14V9" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 3h10l2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5l2-2Z" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
};

/** Copy blocks that are lists of title + text pairs in the `zakat` bundle. */
const ZAKATABLE = ["cash", "metal", "trade", "shares", "loans", "bizProp"] as const;
const EXEMPT = ["home", "tools", "furniture", "badDebt", "rentedProp"] as const;
const FAQS = ["hawl", "metal", "salary", "jewelry", "early", "channels"] as const;
const TARGETS = ["mostNeeded", "zakatPalestine", "reliefQuds", "hotMealsGaza", "parcelsGaza", "qudsEducation"] as const;

export interface ZakatCalculatorProps {
  /** Optional daily rates per gram, in USD. */
  rates?: { gold?: number; silver?: number };
  /** Zakat guide PDF, when one is published. */
  guidePdfHref?: string;
  whatsappNumber?: string;
}

export default function ZakatCalculator({ rates, guidePdfHref, whatsappNumber = "905398436050" }: ZakatCalculatorProps) {
  const locale = useLocale();
  const t = useTranslations("zakat");
  const tCommon = useTranslations("common");
  const { format } = useMinbarMoney();

  const [mode, setMode] = useState<NisabMode>("gold");
  const [goldRate, setGoldRate] = useState(rates?.gold ? String(rates.gold) : "");
  const [silverRate, setSilverRate] = useState(rates?.silver ? String(rates.silver) : "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<string>(TARGETS[0]);
  const [openFaq, setOpenFaq] = useState(0);

  /** Tolerant parse: an empty or malformed field contributes zero, not NaN. */
  const num = (x: string | undefined) => {
    const v = Number.parseFloat(String(x ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(v) ? v : 0;
  };
  const n = (key: string) => num(values[key]);

  const totals = useMemo(() => {
    const gold = num(goldRate);
    const silver = num(silverRate);

    const cash = n("cash") + n("bank") + n("savings") + n("loansOut");
    // Karat weighted by purity — 21k is 21/24 fine, 18k is 18/24.
    const metals = (n("gold24") + n("gold21") * (21 / 24) + n("gold18") * (18 / 24)) * gold + n("silver") * silver;
    const invest = n("shares") + n("funds") + n("pension") + n("rentIncome");
    const trade = n("stock") + n("receivables") + n("cashBiz");
    const liabilities = n("debts") + n("bills") + n("salaries");

    const assets = cash + metals + invest + trade;
    const net = Math.max(0, assets - liabilities);
    const nisab = mode === "gold" ? gold * GOLD_GRAMS : silver * SILVER_GRAMS;
    // Zero nisāb means no rate has been entered — not "everything is due".
    const due = nisab > 0 && net >= nisab ? net * ZAKAT_RATE : 0;

    return { cash, metals, invest, trade, liabilities, net, nisab, due };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, goldRate, silverRate, mode]);

  const aboveNisab = totals.nisab > 0 && totals.net >= totals.nisab;

  const setField = (key: string, raw: string) =>
    setValues((v) => ({ ...v, [key]: raw.replace(/[^0-9.]/g, "") }));

  const groups: Array<{ id: string; icon: keyof typeof GROUP_ICONS; titleKey: string; hintKey: string; accent: string; total: number; fields: readonly string[]; unitKey?: string }> = [
    { id: "wallet", icon: "wallet", titleKey: "grpWallet", hintKey: "grpWalletSub", accent: "var(--deep)", total: totals.cash, fields: FIELDS.cash },
    { id: "gem", icon: "gem", titleKey: "grpGem", hintKey: "grpGemSub", accent: "var(--gold)", total: totals.metals, fields: FIELDS.gem, unitKey: "unitGram" },
    { id: "invest", icon: "trending-up", titleKey: "grpInvest", hintKey: "grpInvestSub", accent: "var(--deep)", total: totals.invest, fields: FIELDS.invest },
    { id: "trade", icon: "store", titleKey: "grpTrade", hintKey: "grpTradeSub", accent: "var(--deep)", total: totals.trade, fields: FIELDS.trade },
    { id: "liab", icon: "receipt", titleKey: "grpLiab", hintKey: "grpLiabSub", accent: "var(--red)", total: totals.liabilities, fields: FIELDS.liabilities },
  ];

  const summary = [
    { label: t("grpWallet"), value: format(totals.cash), color: "var(--deep)" },
    { label: t("grpGem"), value: format(totals.metals), color: "var(--deep)" },
    { label: t("grpInvest"), value: format(totals.invest), color: "var(--deep)" },
    { label: t("grpTrade"), value: format(totals.trade), color: "var(--deep)" },
    { label: t("liabDeducted"), value: `− ${format(totals.liabilities)}`, color: "var(--red)" },
  ];

  return (
    <div style={{ position: "relative" }}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", background: "var(--ivory)", borderBottom: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={patternStyle(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "54px 24px 56px", display: "grid", gap: 15, justifyItems: "start" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(30px,3.6vw,48px)", lineHeight: 1.35, fontWeight: 900 }}>{t("calcTitle")}</h1>
          <div style={{ width: 110, height: 2, background: "var(--gold)" }} />
          <p style={{ margin: 0, maxWidth: "64ch", fontSize: 17, lineHeight: 1.9, color: "var(--muted)" }}>{t("calcLead")}</p>
        </div>
      </section>

      {/* ── Nisāb bar ────────────────────────────────────────────────────── */}
      <section id="nisab" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div id="nisab-row" style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 24px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <span style={{ display: "grid", gap: 4 }}>
            <span style={microLabel}>{t("nisabCriteriaLabel")}</span>
            <span style={{ display: "flex", gap: 8 }}>
              {(["gold", "silver"] as NisabMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-pick={mode === m ? "1" : ""}
                  onClick={() => setMode(m)}
                  style={{ height: 38, padding: "0 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, border: "1px solid var(--border)", background: "#fff", color: "var(--muted)", transition: "all .18s ease" }}
                >
                  {m === "gold" ? t("nisabModeGold") : t("nisabModeSilver")}
                </button>
              ))}
            </span>
          </span>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={microLabel}>{mode === "gold" ? t("rateLabelGold") : t("rateLabelSilver")}</span>
            <input
              value={mode === "gold" ? goldRate : silverRate}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                if (mode === "gold") setGoldRate(val);
                else setSilverRate(val);
              }}
              inputMode="decimal"
              style={{ width: 130, height: 40, border: "1px solid var(--border)", background: "#fff", padding: "0 12px", fontFamily: "inherit", fontWeight: 800, fontSize: 15, color: "var(--deep)" }}
            />
          </label>

          <span style={{ display: "grid", gap: 4 }}>
            <span style={microLabel}>{t("nisabValue")}</span>
            <b dir="ltr" style={{ fontSize: 22, unicodeBidi: "isolate" }}>
              {format(totals.nisab)}
            </b>
          </span>

          <span style={{ marginInlineStart: "auto", maxWidth: "46ch", color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>{t("nisabNote")}</span>
        </div>
      </section>

      {/* ── Calculator ───────────────────────────────────────────────────── */}
      <section id="calc" style={{ position: "relative", background: "transparent", padding: "42px 0 66px", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={patternStyle(520)} />
        <div id="calc-grid" style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 26, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((group) => (
              <div key={group.id} className="zk-card" style={{ background: "#fff", border: "1px solid var(--border)", display: "grid", alignContent: "start", transition: "box-shadow .2s ease" }}>
                <div className="zk-head" style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)", background: "#fff", flexWrap: "wrap" }}>
                  <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, background: "rgba(211,154,39,.12)", color: group.accent, flex: "0 0 auto" }}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {GROUP_ICONS[group.icon]}
                    </svg>
                  </span>
                  <b style={{ fontSize: 18 }}>{t(group.titleKey)}</b>
                  <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>{t(group.hintKey)}</span>
                  <b dir="ltr" style={{ marginInlineStart: "auto", fontSize: 17, color: group.accent, unicodeBidi: "isolate" }}>
                    {format(group.total)}
                  </b>
                </div>

                <div className="zk-fields" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "14px 18px", padding: "20px 22px" }}>
                  {group.fields.map((field) => (
                    <label key={field} style={{ display: "grid", gap: 6, alignContent: "start" }}>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{t(`fld_${field}_label`)}</span>
                      <span style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border)", background: "#fff" }}>
                        <span style={{ display: "grid", placeItems: "center", width: 40, flex: "0 0 40px", background: "var(--sand)", color: "var(--muted)", fontSize: 13, fontWeight: 900, borderInlineEnd: "1px solid var(--border)" }}>
                          {group.unitKey ? t(group.unitKey) : "$"}
                        </span>
                        <input
                          value={values[field] ?? ""}
                          onChange={(e) => setField(field, e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={t(`fld_${field}_label`)}
                          style={{ flex: "1 1 auto", minWidth: 0, height: 44, border: 0, background: "transparent", padding: "0 12px", fontFamily: "inherit", fontWeight: 800, fontSize: 15, color: "var(--deep)" }}
                        />
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>{t(`fld_${field}_note`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "18px 22px", background: "var(--sand)", border: "1px solid var(--border)" }}>
              {/* Not a fatwa — this is stated on the page, not just in a comment. */}
              <span style={{ flex: "1 1 320px", minWidth: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>{t("calcDisclaimer")}</span>
              <button
                type="button"
                onClick={() => setValues({})}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 16px", background: "#fff", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                {t("resetFieldsBtn")}
              </button>
            </div>
          </div>

          <div id="result" style={{ position: "sticky", top: 92, display: "grid", gap: 14, background: "#fff", border: "1px solid rgba(211,154,39,.55)", padding: 24, boxShadow: "0 18px 50px rgba(16,33,43,.1)" }}>
            <b style={{ fontSize: 19 }}>{t("calcSummary")}</b>
            <div style={{ display: "grid", gap: 10, padding: "16px 0", borderBlock: "1px solid var(--border)" }}>
              {summary.map((row) => (
                <span key={row.label} style={{ display: "flex", alignItems: "baseline", gap: 12, fontSize: 14 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 700 }}>{row.label}</span>
                  <b dir="ltr" style={{ marginInlineStart: "auto", unicodeBidi: "isolate", color: row.color }}>
                    {row.value}
                  </b>
                </span>
              ))}
            </div>

            <span style={{ display: "grid", gap: 4 }}>
              <span style={microLabel}>{t("netZakatable")}</span>
              <b dir="ltr" style={{ fontSize: 24, unicodeBidi: "isolate" }}>
                {format(totals.net)}
              </b>
            </span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: aboveNisab ? "rgba(31,122,77,.1)" : "rgba(16,33,43,.05)",
                border: `1px solid ${aboveNisab ? "rgba(31,122,77,.4)" : "var(--border)"}`,
                color: aboveNisab ? "var(--green)" : "var(--muted)",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.6 }}>
                {totals.nisab <= 0 ? t("verdictNoRate") : aboveNisab ? t("verdictAboveNisab") : t("verdictBelowNisab")}
              </span>
            </div>

            <span style={{ display: "grid", gap: 4, padding: "16px 18px", background: "var(--sand)", border: "1px solid rgba(31,122,77,.35)" }}>
              <span style={{ ...microLabel, color: "var(--green)" }}>{t("zakatDueRate")}</span>
              <b dir="ltr" style={{ fontSize: 34, lineHeight: 1.1, color: "var(--green)", unicodeBidi: "isolate" }}>
                {format(totals.due)}
              </b>
            </span>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={microLabel}>{t("directZakatTo")}</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                style={{ height: 44, border: "1px solid var(--border)", background: "#fff", padding: "0 12px", fontFamily: "inherit", fontWeight: 800, fontSize: 14, color: "var(--deep)", cursor: "pointer" }}
              >
                {TARGETS.map((id) => (
                  <option key={id} value={id}>
                    {t(`target_${id}`)}
                  </option>
                ))}
              </select>
            </label>

            <Button variant="primary" href={miaPath("projects", locale)} full style={{ height: 50 }}>
              {tCommon("donateNow")}
            </Button>
            <small style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.75 }}>{t("spendNote")}</small>
          </div>
        </div>
      </section>

      {/* ── What is and is not zakatable ─────────────────────────────────── */}
      <section id="guide" style={{ position: "relative", background: "var(--sand)", padding: "62px 0", borderBlock: "1px solid var(--border)", overflow: "hidden" }}>
        <div aria-hidden="true" data-aqsa-pattern="" style={patternStyle(520)} />
        <div style={{ position: "relative", maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.25, fontWeight: 900 }}>{t("whatIsDue")}</h2>
          <p style={{ margin: "0 0 26px", maxWidth: "76ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{t("dueNote")}</p>
          <div id="guide-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 20 }}>
            <div style={{ display: "grid", gap: 12, alignContent: "start", padding: 26, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--green)" }}>
              <b style={{ fontSize: 18 }}>{t("zakatableFunds")}</b>
              {ZAKATABLE.map((id) => (
                <span key={id} style={{ display: "flex", alignItems: "baseline", gap: 11, fontSize: 15, lineHeight: 1.8 }}>
                  <span style={{ flex: "0 0 auto", width: 6, height: 6, background: "var(--green)", transform: "rotate(45deg)" }} />
                  <span>
                    <b>{t(`zak_${id}_title`)}</b> <span style={{ color: "var(--muted)" }}>{t(`zak_${id}_text`)}</span>
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: "grid", gap: 12, alignContent: "start", padding: 26, background: "#fff", border: "1px solid var(--border)", borderTop: "3px solid var(--red)" }}>
              <b style={{ fontSize: 18 }}>{t("notZakatableFunds")}</b>
              {EXEMPT.map((id) => (
                <span key={id} style={{ display: "flex", alignItems: "baseline", gap: 11, fontSize: 15, lineHeight: 1.8 }}>
                  <span style={{ flex: "0 0 auto", width: 6, height: 6, background: "var(--red)", transform: "rotate(45deg)" }} />
                  <span>
                    <b>{t(`ex_${id}_title`)}</b> <span style={{ color: "var(--muted)" }}>{t(`ex_${id}_text`)}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: "transparent", padding: "62px 0" }}>
        <div id="zk-faq-grid" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 40, alignItems: "start" }}>
          <div>
            <h2 style={{ margin: "0 0 18px", fontSize: "clamp(26px,2.8vw,38px)", lineHeight: 1.25, fontWeight: 900 }}>{t("calcFaq")}</h2>
            <div style={{ display: "grid", borderTop: "1px solid var(--border)", background: "#fff" }}>
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
                    {/* Height, not display — the answer opens smoothly instead of
                        snapping into place. */}
                    <div
                      style={{
                        maxHeight: open ? 500 : 0,
                        opacity: open ? 1 : 0,
                        padding: open ? "0 18px 18px" : "0 18px",
                        overflow: "hidden",
                        color: "var(--muted)",
                        fontSize: 15,
                        lineHeight: 1.85,
                        transition: "all .3s cubic-bezier(.22,.61,.36,1)",
                      }}
                    >
                      {t(`faq_${id}_a`)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14, padding: 26, background: "#fff", border: "1px solid rgba(211,154,39,.5)" }}>
            <b style={{ fontSize: 18 }}>{t("needReview")}</b>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.85 }}>{t("teamHelp")}</p>
            <Button variant="support" href={`https://wa.me/${whatsappNumber}`} full style={{ height: 46 }}>
              {tCommon("contactWhatsApp")}
            </Button>
            <Button variant="light" href={miaPath("zakat", locale)} full style={{ height: 46 }}>
              {t("zakatPage")}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Share / guide ────────────────────────────────────────────────── */}
      <section style={{ background: "#fff", borderBlock: "1px solid var(--border)", padding: "28px 0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>
            {t("shareCalculator")}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(t("calcTitle"))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 999, background: "var(--sand)", border: "1px solid var(--border)" }}
              aria-label={tCommon("contactWhatsApp")}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: "var(--green)" }} aria-hidden="true">
                <path d="M20.5 3.5A11 11 0 0 0 3.6 17L2 22l5.2-1.6A11 11 0 1 0 20.5 3.5Zm-8.5 17a9 9 0 0 1-4.6-1.2l-.3-.2-3 .9.9-2.9-.2-.3A9 9 0 1 1 12 20.5Zm5-6.7c-.3-.1-1.6-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.2-.3.2-.5.1-1.5-.7-2.4-1.3-3.4-2.9-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5L9.6 7.2c-.1-.3-.3-.2-.5-.2h-.4c-.2 0-.5.1-.7.3-.2.3-.9 1-.9 2.3 0 1.3 1 2.7 1.1 2.9.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
              </svg>
            </a>
          </span>
          {guidePdfHref ? (
            <a href={guidePdfHref} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 18px", border: "1px solid rgba(211,154,39,.6)", background: "var(--sand)", color: "var(--deep)", fontWeight: 800, fontSize: 13.5 }}>
              {t("guidePdf")}
            </a>
          ) : null}
        </div>
      </section>

      <TravelBanner />
    </div>
  );
}

const microLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 900,
  color: "var(--muted)",
  letterSpacing: ".06em",
};

const patternStyle = (size: number): CSSProperties => ({
  position: "absolute",
  inset: 0,
  backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
  backgroundRepeat: "repeat",
  backgroundSize: `${size}px ${size}px`,
  opacity: 0.05,
  pointerEvents: "none",
});
