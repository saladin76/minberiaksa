"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * The sticky quick-donation bar under the hero — ported from the `#quick`
 * section of `Minbar/الصفحة الرئيسية.dc.html`.
 *
 * Destination, frequency and amount in one row. Everything the bar holds is an
 * identifier, never a displayed string: the selected destination is a project
 * slug (or the `whereNeedGreatest` key), and the frequency is `once` / `daily` /
 * `friday` / `monthly`. Storing the label instead would send Arabic text to the
 * cart from a French session the moment the labels were translated.
 *
 * The donate action adds to the basket and routes to the cart — the same path as
 * "add to basket" on a project card. On phones the bar is collapsed and the
 * first press expands it rather than submitting a selection the visitor has not
 * seen.
 */

const FREQUENCIES: ReadonlyArray<{ id: CartFreqKey; key: string }> = [
  { id: "once", key: "oneTime" },
  { id: "daily", key: "daily" },
  { id: "friday", key: "everyFriday" },
  { id: "monthly", key: "monthly" },
];

const AMOUNTS = [100, 300, 500, 700];

/** The generic destinations that are not a single project. */
const GENERIC_DESTINATIONS = [
  { id: "where-needed", ns: "common", key: "whereNeedGreatest" },
  { id: "zakat", ns: "navigation", key: "zakat" },
  { id: "waqf", ns: "navigation", key: "waqf" },
  { id: "gaza-relief", ns: "homepage", key: "gazaReliefGroup" },
] as const;

export default function QuickDonateBar({ projects }: { projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const { format } = useMinbarMoney();

  const [destination, setDestination] = useState("where-needed");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  const label = (ns: string, key: string) =>
    ns === "common" ? t(key) : ns === "navigation" ? tNav(key) : tHome(key);

  const options = [
    ...GENERIC_DESTINATIONS.map((d) => ({ id: d.id, label: label(d.ns, d.key) })),
    ...projects.map((p) => ({ id: p.slug, label: p.title })),
  ];

  const total = custom ? Number(custom) : amount;

  const chip = (active: boolean): CSSProperties => ({
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--deep)" : "var(--border)"}`,
    background: active ? "var(--deep)" : "#fff",
    color: active ? "#fff" : "var(--muted)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 800,
    whiteSpace: "nowrap",
    transition: "all .14s ease",
  });

  const submit = () => {
    // Collapsed on a phone: the first press opens the sheet so the donor can see
    // what they are about to give before committing to it.
    if (!open && typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches) {
      setOpen(true);
      return;
    }
    if (!(total > 0)) return;
    const isGeneric = GENERIC_DESTINATIONS.some((d) => d.id === destination);
    addToCart(
      isGeneric
        ? { titleKey: destination === "where-needed" ? "whereNeedGreatest" : destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
        : { projectId: destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
    );
    router.push(miaPath("cart", locale));
  };

  const destinationSelect = (style: CSSProperties) => (
    <select
      value={destination}
      onChange={(e) => setDestination(e.target.value)}
      aria-label={tHome("projectSelectLabel")}
      style={style}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const freqButtons = (height: number, padding: string, fontSize: number) =>
    FREQUENCIES.map((f) => (
      <button
        key={f.id}
        type="button"
        data-chip={freq === f.id ? "freq" : ""}
        onClick={() => setFreq(f.id)}
        style={{ ...chip(freq === f.id), height, padding, fontSize }}
      >
        {t(f.key)}
      </button>
    ));

  const amountButtons = (height: number, padding: string, fontSize: number) =>
    AMOUNTS.map((value) => (
      <button
        key={value}
        type="button"
        data-chip={amount === value && !custom ? "amt" : ""}
        onClick={() => {
          setAmount(value);
          setCustom("");
        }}
        style={{ ...chip(amount === value && !custom), height, padding, fontSize }}
      >
        <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
          {format(value)}
        </span>
      </button>
    ));

  return (
    <section
      id="quick"
      data-qopen={open ? "true" : "false"}
      style={{ position: "sticky", top: 116, zIndex: 50, marginTop: -44, scrollMarginTop: 120 }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
        {/* Desktop bar */}
        <div
          className="mia-qdesk"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 16,
            height: 68,
            paddingInlineStart: 20,
            background: "#fff",
            border: "1px solid rgba(211,154,39,.5)",
            borderRadius: 12,
            boxShadow: "0 18px 50px rgba(16,33,43,.12)",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            data-aqsa-pattern=""
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url('/minbar/assets/patterns/aqsa-white-pattern.webp')",
              backgroundRepeat: "repeat",
              backgroundSize: "200px 200px",
              opacity: 0.07,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
          <span
            aria-hidden="true"
            style={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, width: 6, background: "linear-gradient(180deg, var(--gold), rgba(211,154,39,.25))", pointerEvents: "none" }}
          />

          {destinationSelect({
            flex: "0 1 148px",
            minWidth: 96,
            height: 40,
            border: "1px solid var(--border)",
            borderRadius: 999,
            background: "#fff",
            padding: "0 10px",
            fontFamily: "inherit",
            fontWeight: 800,
            fontSize: 13,
            color: "var(--deep)",
            cursor: "pointer",
            textOverflow: "ellipsis",
            position: "relative",
          })}

          <Divider />
          <div style={{ position: "relative", flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
            {freqButtons(34, "0 12px", 13)}
          </div>
          <Divider />
          <div style={{ position: "relative", flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>
            {amountButtons(34, "0 12px", 13)}
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="decimal"
              placeholder={t("freeAmount")}
              aria-label={t("freeAmount")}
              style={{
                flex: "0 1 auto",
                width: "9ch",
                minWidth: "7ch",
                maxWidth: "12ch",
                height: 34,
                padding: "0 9px",
                borderRadius: 999,
                boxSizing: "border-box",
                border: `1px solid ${custom ? "var(--deep)" : "var(--border)"}`,
                background: "#fff",
                color: "var(--deep)",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 800,
              }}
            />
          </div>

          <div style={{ position: "relative", flex: "0 0 auto", marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 18 }}>
            <Divider />
            <b dir="ltr" style={{ fontSize: 19, color: "var(--deep)", unicodeBidi: "isolate", whiteSpace: "nowrap", paddingInlineEnd: 2 }}>
              {format(total)}
            </b>
            <button
              type="button"
              onClick={submit}
              style={{
                whiteSpace: "nowrap",
                height: 68,
                border: 0,
                borderRadius: 0,
                paddingInline: "30px 26px",
                fontSize: 16,
                fontWeight: 900,
                fontFamily: "inherit",
                background: "var(--red)",
                color: "#fff",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {t("donate")}
            </button>
          </div>
        </div>

        {/* Phone sheet */}
        <div className="mia-qm">
          <div className="mia-qm-body">
            <span className="mia-qm-handle" aria-hidden="true" />
            <div style={{ display: "grid", gap: 7 }}>
              <b style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>{tHome("projectSelectLabel")}</b>
              {destinationSelect({
                width: "100%",
                height: 46,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "#fff",
                padding: "0 12px",
                fontFamily: "inherit",
                fontWeight: 800,
                fontSize: 14,
                color: "var(--deep)",
              })}
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <b style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>{t("frequency")}</b>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{freqButtons(40, "0 15px", 13.5)}</div>
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <b style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)" }}>{t("amount")}</b>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {amountButtons(40, "0 15px", 13.5)}
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="decimal"
                  placeholder={t("freeAmount")}
                  aria-label={t("freeAmount")}
                  style={{
                    flex: "0 1 auto",
                    width: "10ch",
                    height: 40,
                    padding: "0 12px",
                    border: "1px dashed rgba(211,154,39,.65)",
                    borderRadius: 999,
                    background: "#fff",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    fontSize: 13.5,
                    color: "var(--deep)",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mia-qm-bar">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mia-qm-toggle"
              aria-label={t("quickDonate")}
              aria-expanded={open}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>{t("quickDonate")}</span>
              <b dir="ltr" style={{ fontSize: 19, lineHeight: 1.2, color: "var(--deep)", unicodeBidi: "isolate", whiteSpace: "nowrap" }}>
                {format(total)}
              </b>
            </span>
            <button
              type="button"
              onClick={submit}
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 50,
                border: 0,
                borderRadius: 10,
                background: "var(--red)",
                color: "#fff",
                fontFamily: "inherit",
                fontWeight: 900,
                fontSize: 15,
                cursor: "pointer",
                boxShadow: "0 10px 24px rgba(169,52,40,.32)",
              }}
            >
              {t("donate")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Divider() {
  return <span style={{ position: "relative", flex: "0 0 auto", width: 1, height: 30, background: "var(--border)" }} />;
}
