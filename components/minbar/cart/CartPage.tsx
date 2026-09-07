"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/minbar/ds";
import { miaPath } from "@/lib/minbar/routes";
import { useMinbarCart } from "@/hooks/useMinbarCart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarCartItem } from "@/lib/minbar/cart";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * Giving basket — ported from `Minbar/السلة.dc.html`.
 *
 * The governing contract (`DEVELOPER_HANDOFF` § Cart Localization):
 *
 *   CART = LIVE LOCALIZED REFERENCE · CONFIRMED ORDER = IMMUTABLE SNAPSHOT
 *
 * So every row's title is resolved **at render time** from the active locale:
 * `projectId` → the project list → the stored title as a last resort. Switching
 * language re-resolves the labels and must never add, remove, reorder or edit a
 * row. A raw key or `undefined` must never reach the screen.
 *
 * `[BACKEND-INTEGRATION]`: this is client-controlled data. The server
 * re-resolves every id and recomputes amount, currency and availability when the
 * order is created — what is shown here is display state, never the basis for a
 * charge.
 *
 * `[DESIGN-CONTRACT]`: below 760px the rows become cards rather than a table.
 * That is an approved decision; the table is not to be reinstated on mobile.
 */

/** Cross-sell rows, from `Component.DEFAULT_SUGGESTIONS`. */
const SUGGESTIONS = [
  { id: "field-team", key: "upsell_field_team", amounts: [50, 75, 100] },
  { id: "waqf-share-quds", key: "upsell_waqf_share_quds", amounts: [50, 75, 100] },
  { id: "quran-quds", key: "upsell_quran_quds", amounts: [50, 75, 100] },
  { id: "friday-transport", key: "upsell_friday_transport", amounts: [50, 75, 100] },
] as const;

/** Frequency id → its label key in the `cart` namespace. */
const FREQ_LABEL: Record<string, string> = {
  once: "freqOnce",
  daily: "freqDaily",
  friday: "freqFriday",
  monthly: "freqMonthly",
};

/** Donation type id → its label key in the `cart` namespace. */
const TYPE_LABEL: Record<string, string> = {
  project: "typeProject",
  zakat: "typeZakat",
  waqf: "typeWaqf",
  recurring: "typeRecurring",
  extra: "typeExtra",
};

export default function CartPage({ projects }: { projects: MinbarProject[] }) {
  const locale = useLocale();
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProjects = useTranslations("projects");
  const { format } = useMinbarMoney();
  const { items, replace, remove, hydrated } = useMinbarCart();

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [customUpsell, setCustomUpsell] = useState<Record<string, string>>({});

  /** Project slug → its title in the active locale. */
  const titleBySlug = useMemo(
    () => new Map(projects.map((p) => [p.slug, p.title])),
    [projects]
  );

  /**
   * Resolve a row's display title, live, in this order:
   *   projectId → the CMS title for this locale
   *   titleKey  → the translated interface label (generic destinations)
   *   title     → the stored legacy string
   * The last step is what keeps an unresolved v1 row visible instead of blank.
   */
  const resolveTitle = (item: MinbarCartItem): string => {
    if (item.projectId) {
      const fromCms = titleBySlug.get(item.projectId);
      if (fromCms) return fromCms;
    }
    if (item.titleKey) {
      if (t.has(item.titleKey)) return t(item.titleKey);
      if (tCommon.has(item.titleKey)) return tCommon(item.titleKey);
    }
    return item.title ?? "";
  };

  const metaLine = (item: MinbarCartItem): string =>
    [
      item.typeKey && item.typeKey !== "extra" && TYPE_LABEL[item.typeKey] && t.has(TYPE_LABEL[item.typeKey])
        ? t(TYPE_LABEL[item.typeKey])
        : "",
      FREQ_LABEL[item.freqKey] && t.has(FREQ_LABEL[item.freqKey]) ? t(FREQ_LABEL[item.freqKey]) : "",
    ]
      .filter(Boolean)
      .join(" · ");

  /**
   * Totals are grouped by currency and never summed across them: adding a
   * dollar figure to a euro one produces a number that means nothing, and the
   * exchange happens at payment, not here.
   */
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const item of items) {
      byCurrency.set(item.currency, (byCurrency.get(item.currency) ?? 0) + item.amount);
    }
    return [...byCurrency.entries()];
  }, [items]);

  const recurringOn = items.some((x) => x._autoMonthly);

  /* One click converts every one-time row to monthly, and the same click undoes
     it. Only `freqKey` changes — no rows are created, removed or reordered. */
  const toggleRecurring = () => {
    replace(
      items.map((item) => {
        if (!recurringOn && item.freqKey === "once") return { ...item, freqKey: "monthly" as const, _autoMonthly: true };
        if (recurringOn && item._autoMonthly) {
          const next = { ...item, freqKey: "once" as const };
          delete next._autoMonthly;
          return next;
        }
        return item;
      })
    );
  };

  const toggleMonthly = (index: number) => {
    replace(
      items.map((item, i) =>
        i === index ? { ...item, freqKey: item.freqKey === "monthly" ? "once" : "monthly" } : item
      )
    );
  };

  const commitEdit = (index: number) => {
    const value = Number(draft);
    if (value > 0) replace(items.map((item, i) => (i === index ? { ...item, amount: value } : item)));
    setEditing(null);
    setDraft("");
  };

  const addSuggestion = (id: string, key: string, amount: number) => {
    if (!(amount > 0)) return;
    replace([
      ...items,
      { titleKey: key, typeKey: "extra", freqKey: "once", amount, currency: "USD", upsellId: id },
    ]);
  };

  const steps = [
    { n: 1, label: t("stepCart"), href: miaPath("cart", locale), current: true },
    { n: 2, label: t("stepDetails"), href: miaPath("checkout", locale), current: false },
    { n: 3, label: t("stepConfirm"), href: miaPath("checkout", locale), current: false },
  ];

  return (
    <div style={{ position: "relative" }}>
      <section style={{ padding: "16px 0 6px" }}>
        <div id="cart-steps" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          {steps.map((step, i) => (
            <span key={step.n} style={{ display: "contents" }}>
              <Link
                href={step.href}
                className="cart-step"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: `1px solid ${step.current ? "var(--gold)" : "var(--border)"}`,
                  background: step.current ? "#fff" : "transparent",
                  color: step.current ? "var(--deep)" : "var(--muted)",
                  fontSize: 13,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  transition: "border-color .18s ease",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: step.current ? "var(--gold)" : "var(--border)",
                    color: step.current ? "#10212B" : "var(--muted)",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {step.n}
                </span>
                {step.label}
              </Link>
              {i < steps.length - 1 ? (
                <span aria-hidden="true" style={{ flex: "1 1 24px", maxWidth: 60, height: 1, background: "var(--border)" }} />
              ) : null}
            </span>
          ))}
        </div>
      </section>

      <section style={{ padding: "16px 0 14px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(24px,2.8vw,32px)", fontWeight: 900 }}>{t("pageTitle")}</h1>
        </div>
      </section>

      {/* Before hydration the cart contents are unknown to the server, so the
          page holds its shape rather than flashing the empty state. */}
      {!hydrated ? (
        <section style={{ padding: "0 0 70px" }}>
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", minHeight: 320 }} />
        </section>
      ) : items.length ? (
        <section style={{ padding: "0 0 70px" }}>
          <div id="cart-grid" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.8fr)", gap: 40, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 26, minWidth: 0, alignContent: "start" }}>
              <div style={{ display: "grid", gap: 0, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(16,33,43,.06)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "15px 22px", background: "var(--navy)", color: "#fff" }}>
                  <b style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 14.5, fontWeight: 900 }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="9" cy="21" r="1" />
                      <circle cx="20" cy="21" r="1" />
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                    </svg>
                    {t("itemsHeading")}
                  </b>
                  <span style={{ flex: "0 0 auto", minWidth: 26, height: 26, padding: "0 8px", display: "grid", placeItems: "center", borderRadius: 999, background: "var(--gold)", color: "#10212B", fontSize: 13, fontWeight: 900 }}>
                    {items.length}
                  </span>
                </div>

                {items.map((item, index) => {
                  const isEditing = editing === index;
                  const isMonthly = item.freqKey === "monthly";
                  return (
                    <div key={`${item.projectId ?? item.titleKey ?? item.title}-${index}`} className="cart-row">
                      <b className="c-title" style={{ gridColumn: 1, minWidth: 0, fontSize: 15.5, overflowWrap: "anywhere" }}>
                        {resolveTitle(item)}
                      </b>
                      <span className="c-meta" style={{ gridColumn: 1, gridRow: 2, display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflowWrap: "anywhere", fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                        {metaLine(item)}
                      </span>

                      <span className="c-ctl" style={{ gridColumn: 2, gridRow: "1 / span 2", display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {isEditing ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(index);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              inputMode="decimal"
                              dir="ltr"
                              autoFocus
                              aria-label={tCommon("editAmount")}
                              style={{ width: 96, height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13.5, fontWeight: 800, color: "var(--deep)", boxSizing: "border-box", unicodeBidi: "isolate" }}
                            />
                            <button type="button" onClick={() => commitEdit(index)} aria-label={tCommon("add")} className="cart-ok" style={iconBtn("var(--green)", "rgba(31,122,77,.08)")}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            </button>
                            <button type="button" onClick={() => setEditing(null)} aria-label={tCommon("close")} className="cart-cancel" style={iconBtn("var(--red)", "rgba(169,52,40,.06)")}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="cart-amt-btn"
                            onClick={() => {
                              setEditing(index);
                              setDraft(String(item.amount));
                            }}
                            title={tCommon("editAmount")}
                            aria-label={tCommon("editAmount")}
                            style={{ display: "inline-flex", alignItems: "stretch", background: "#fff", border: "1px solid rgba(16,33,43,.16)", borderRadius: 10, cursor: "pointer", padding: 0, overflow: "hidden", transition: "all .18s cubic-bezier(.22,.61,.36,1)" }}
                          >
                            <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-flex", alignItems: "center", padding: "0 14px", height: 40, fontSize: 16.5, fontWeight: 900, whiteSpace: "nowrap", color: "var(--deep)", fontVariantNumeric: "tabular-nums" }}>
                              {format(item.amount)}
                            </span>
                            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 34, background: "rgba(211,154,39,.14)", borderInlineStart: "1px solid rgba(211,154,39,.35)", color: "var(--gold)" }}>
                              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleMonthly(index)}
                          className="cart-monthly"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            height: 32,
                            padding: "0 11px",
                            borderRadius: 999,
                            border: `1px solid ${isMonthly ? "var(--green)" : "rgba(16,33,43,.18)"}`,
                            background: isMonthly ? "rgba(31,122,77,.1)" : "#fff",
                            color: isMonthly ? "var(--green)" : "var(--muted)",
                            fontFamily: "inherit",
                            fontSize: 12,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                            transition: "all .18s ease",
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17 2v4H7a4 4 0 0 0-4 4M7 22v-4h10a4 4 0 0 0 4-4" />
                          </svg>
                          {isMonthly ? t("monthlyActive") : t("makeMonthly")}
                        </button>
                      </span>

                      <button
                        type="button"
                        className="c-del"
                        onClick={() => remove(index)}
                        aria-label={tCommon("remove")}
                        title={tCommon("remove")}
                        style={{ gridColumn: 3, gridRow: "1 / span 2", width: 36, height: 36, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 8, background: "transparent", color: "var(--muted)", cursor: "pointer", alignSelf: "center" }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Cross-sell */}
              <div style={{ position: "relative", overflow: "hidden", display: "grid", gap: 14, padding: 22, background: "var(--sand)", border: "1px dashed rgba(211,154,39,.55)", borderRadius: 12 }}>
                <span
                  aria-hidden="true"
                  data-aqsa-pattern=""
                  style={{ position: "absolute", inset: 0, backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')", backgroundRepeat: "repeat", backgroundSize: "260px 260px", opacity: 0.04, pointerEvents: "none" }}
                />
                <b style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 900, color: "var(--deep)" }}>
                  <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: "rgba(211,154,39,.18)", color: "var(--gold)" }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  {t("upsellHeading")}
                </b>

                <div id="upsell-rail" style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 10 }}>
                  {SUGGESTIONS.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="upsell-card"
                      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "14px 16px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, transition: "all .18s ease" }}
                    >
                      <b style={{ flex: "1 1 100%", minWidth: 0, display: "inline-flex", alignItems: "flex-start", gap: 9, fontSize: 14, fontWeight: 900, lineHeight: 1.65, color: "var(--deep)", overflowWrap: "anywhere" }}>
                        <span aria-hidden="true" style={{ flex: "0 0 auto", width: 5, height: 5, background: "var(--gold)", transform: "rotate(45deg)", marginTop: 8 }} />
                        {t(suggestion.key)}
                      </b>
                      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 7, minWidth: 0, flex: "0 1 auto" }}>
                        {suggestion.amounts.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => addSuggestion(suggestion.id, suggestion.key, value)}
                            className="upsell-amt"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--border)", background: "#fff", color: "var(--deep)", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", transition: "all .18s ease" }}
                          >
                            <span aria-hidden="true" style={{ fontWeight: 900 }}>+</span>
                            <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(value)}</span>
                          </button>
                        ))}
                        <input
                          value={customUpsell[suggestion.id] ?? ""}
                          onChange={(e) => setCustomUpsell((c) => ({ ...c, [suggestion.id]: e.target.value.replace(/[^0-9]/g, "") }))}
                          inputMode="decimal"
                          placeholder={t("suggestedAmount")}
                          aria-label={t("suggestedAmount")}
                          className="upsell-custom-input"
                          style={{ flex: "0 1 auto", width: "9ch", minWidth: "7ch", height: 34, padding: "0 10px", borderRadius: 999, border: "1px dashed rgba(211,154,39,.65)", background: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: "var(--deep)", boxSizing: "border-box" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addSuggestion(suggestion.id, suggestion.key, Number(customUpsell[suggestion.id]));
                            setCustomUpsell((c) => ({ ...c, [suggestion.id]: "" }));
                          }}
                          aria-label={tCommon("add")}
                          className="upsell-add"
                          style={{ flex: "0 0 auto", width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 999, border: 0, background: "var(--red)", color: "#fff", cursor: "pointer", transition: "all .18s ease" }}
                        >
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div id="cart-summary" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 18, padding: 28, background: "var(--sand)", borderRadius: 16, position: "sticky", top: 92, width: "100%", boxSizing: "border-box", minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{t("summary")}</h2>
              <div style={{ display: "grid", gap: 10, paddingBottom: 16, borderBottom: "1px solid var(--border)", minWidth: 0 }}>
                {items.map((item, index) => (
                  <span key={index} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13.5, color: "var(--muted)", minWidth: 0 }}>
                    <span title={resolveTitle(item)} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {resolveTitle(item)}
                    </span>
                    <span dir="ltr" style={{ unicodeBidi: "isolate", flex: "0 0 auto", fontWeight: 800, color: "var(--deep)" }}>
                      {format(item.amount)}
                    </span>
                  </span>
                ))}
              </div>

              {totals.map(([currency, total]) => (
                <span key={currency} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 15, fontWeight: 800, color: "var(--deep)" }}>
                  {t("totalForCurrency", { currency })}
                  <span dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 24, fontWeight: 900 }}>
                    {format(total)}
                  </span>
                </span>
              ))}
              {totals.length > 1 ? (
                <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{t("multiCurrencyNote")}</span>
              ) : null}

              <button
                type="button"
                onClick={toggleRecurring}
                data-on={recurringOn ? "1" : "0"}
                className="cart-recurring"
                style={{
                  display: "grid",
                  gap: 10,
                  padding: "16px 18px",
                  borderRadius: 12,
                  border: `1px solid ${recurringOn ? "var(--gold)" : "rgba(255,255,255,.14)"}`,
                  background: "var(--deep)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "start",
                  transition: "border-color .18s ease",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                  <b style={{ fontSize: 15.5, fontWeight: 900, color: "#fff", lineHeight: 1.45, minWidth: 0 }}>{t("recurringNudgeEyebrow")}</b>
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: recurringOn ? "flex-end" : "flex-start",
                      width: 44,
                      height: 24,
                      padding: 3,
                      borderRadius: 999,
                      background: recurringOn ? "var(--green)" : "rgba(255,255,255,.22)",
                      transition: "background .2s ease",
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
                  </span>
                </span>
                <span style={{ display: "block", width: "100%", height: 1, background: "rgba(255,255,255,.12)" }} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--gold)", lineHeight: 1.7, textWrap: "balance" }}>{t("recurringNudge")}</span>
                <span style={{ fontSize: "clamp(9.5px, 2.7vw, 11.5px)", fontWeight: 600, color: "rgba(255,255,255,.6)", lineHeight: 1.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {t("recurringNudgeText")}
                </span>
              </button>

              <Button variant="primary" href={miaPath("checkout", locale)} full style={{ whiteSpace: "nowrap", height: 52 }}>
                {t("checkout")}
              </Button>
              <Link href={miaPath("projects", locale)} className="cart-add-another" style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)", transition: "color .15s ease" }}>
                {t("addAnother")}
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section style={{ padding: "30px 0 100px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 24px", display: "grid", justifyItems: "center", gap: 16, textAlign: "center" }}>
            <span style={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: "50%", background: "var(--sand)", color: "var(--muted)" }}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 8 2 11h12l2-11H4Z" />
                <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
              </svg>
            </span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{t("emptyTitle")}</h2>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.85 }}>{t("emptyText")}</p>
            <Button variant="primary" href={miaPath("projects", locale)} style={{ whiteSpace: "nowrap" }}>
              {tProjects("allProjects")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

const iconBtn = (color: string, background: string): CSSProperties => ({
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  border: `1px solid ${color}`,
  borderRadius: 8,
  background,
  color,
  cursor: "pointer",
  transition: "transform .15s ease, background .15s ease",
});
