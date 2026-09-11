"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * The quick-donation card under the hero — ported from the `#quick` section of
 * `Minbar/الصفحة الرئيسية.dc.html`, rebuilt as three visible decisions.
 *
 * The earlier bar packed a 138-option <select>, four frequency chips, four
 * amounts and a free field into one 68px strip and pinned it to the top of the
 * viewport. Nothing in it said what a choice meant, and the pinned strip took
 * a permanent slice of every screen. This version is a card that reads in the
 * order a donor decides — where, how often, how much — using the same three
 * step titles the "how your donation arrives" section already carries, and it
 * is in the flow of the page. Once it scrolls out of view a slim bar takes its
 * place with just the running total and the button, and disappears again the
 * moment the card is back.
 *
 * What raises the average gift without pressure: the middle preset is marked
 * as the suggested amount and selected by default, the button states the
 * amount it will charge, and the trust line under it says the payment is
 * encrypted and a receipt follows. Nothing is pre-checked that costs more than
 * the visitor sees.
 *
 * Everything the card holds is an identifier, never a displayed string: the
 * destination is a project slug or a generic key, the frequency is
 * `once`/`daily`/`friday`/`monthly`. Storing a label would send Arabic text to
 * the cart from a French session the moment the labels were translated.
 *
 * The donate action adds to the basket and routes to the cart — the same path
 * as "add to basket" on a project card. On phones the card is a sheet fixed to
 * the bottom edge: collapsed to the total and the button, expanding on tap so
 * the first press never submits a selection the visitor has not seen.
 */

const FREQUENCIES: ReadonlyArray<{ id: CartFreqKey; key: string }> = [
  { id: "once", key: "oneTime" },
  { id: "daily", key: "daily" },
  { id: "friday", key: "everyFriday" },
  { id: "monthly", key: "monthly" },
];

const AMOUNTS = [100, 300, 500, 700];
/** Index into AMOUNTS that is tagged "suggested" and selected by default. */
const SUGGESTED = 1;

/** The generic destinations that are not a single project. */
const GENERIC_DESTINATIONS = [
  { id: "where-needed", ns: "common", key: "whereNeedGreatest" },
  { id: "zakat", ns: "navigation", key: "zakat" },
  { id: "waqf", ns: "navigation", key: "waqf" },
  { id: "gaza-relief", ns: "homepage", key: "gazaReliefGroup" },
] as const;

const NO_PROJECT = "";

export default function QuickDonateBar({ projects }: { projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tSystem = useTranslations("system");
  const { format, currency } = useMinbarMoney();

  const [destination, setDestination] = useState<string>("where-needed");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState(AMOUNTS[SUGGESTED]);
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  const cardRef = useRef<HTMLElement | null>(null);

  const label = (ns: string, key: string) =>
    ns === "common" ? t(key) : ns === "navigation" ? tNav(key) : tHome(key);

  const isGeneric = GENERIC_DESTINATIONS.some((d) => d.id === destination);
  const projectValue = isGeneric ? NO_PROJECT : destination;
  const destinationLabel = useMemo(() => {
    const g = GENERIC_DESTINATIONS.find((d) => d.id === destination);
    if (g) return label(g.ns, g.key);
    return projects.find((p) => p.slug === destination)?.title ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, projects, locale]);

  const total = custom ? Number(custom) : amount;
  const freqLabel = t(FREQUENCIES.find((f) => f.id === freq)?.key ?? "oneTime");

  /* The slim bar appears only once the card has scrolled off the top — never
     while it is still below the fold, where showing it would be a nag. */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Mirrored onto <body> so the WhatsApp button can step aside while the
     phone sheet is open without relying on :has() support. */
  useEffect(() => {
    if (open) document.body.setAttribute("data-quick-open", "true");
    else document.body.removeAttribute("data-quick-open");
    return () => document.body.removeAttribute("data-quick-open");
  }, [open]);

  const submit = () => {
    // Collapsed on a phone: the first press opens the sheet so the donor can see
    // what they are about to give before committing to it.
    if (!open && typeof window !== "undefined" && window.matchMedia("(max-width: 960px)").matches) {
      setOpen(true);
      return;
    }
    if (!(total > 0)) return;
    addToCart(
      isGeneric
        ? { titleKey: destination === "where-needed" ? "whereNeedGreatest" : destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
        : { projectId: destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
    );
    router.push(miaPath("cart", locale));
  };

  const scrollToCard = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  /* ── Pieces shared by the card and the sheet ─────────────────────────── */

  const chip = (active: boolean, tone: "deep" | "gold" = "deep"): CSSProperties => ({
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? (tone === "gold" ? "var(--gold)" : "var(--deep)") : "var(--border)"}`,
    background: active ? (tone === "gold" ? "var(--gold)" : "var(--deep)") : "#fff",
    color: active ? (tone === "gold" ? "var(--deep)" : "#fff") : "var(--deep)",
    fontFamily: "inherit",
    fontSize: 13.5,
    fontWeight: 800,
    whiteSpace: "nowrap",
    transition: "all .14s ease",
    boxShadow: active ? "0 6px 16px rgba(16,33,43,.14)" : "none",
  });

  const destinationChips = GENERIC_DESTINATIONS.map((d) => {
    const active = destination === d.id;
    return (
      <button key={d.id} type="button" onClick={() => setDestination(d.id)} aria-pressed={active} style={chip(active)}>
        {label(d.ns, d.key)}
      </button>
    );
  });

  const projectSelect = (
    <span className="mia-q-select">
      <select
        value={projectValue}
        onChange={(e) => setDestination(e.target.value || "where-needed")}
        aria-label={tHome("projectSelectLabel")}
        data-selected={projectValue ? "true" : "false"}
      >
        <option value={NO_PROJECT}>{tHome("projectSelectLabel")}…</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>{p.title}</option>
        ))}
      </select>
    </span>
  );

  const freqChips = FREQUENCIES.map((f) => {
    const active = freq === f.id;
    return (
      <button key={f.id} type="button" data-chip={active ? "freq" : ""} onClick={() => setFreq(f.id)} aria-pressed={active} style={chip(active, "gold")}>
        {t(f.key)}
      </button>
    );
  });

  const amountChips = AMOUNTS.map((value, i) => {
    const active = amount === value && !custom;
    return (
      <button
        key={value}
        type="button"
        data-chip={active ? "amt" : ""}
        onClick={() => { setAmount(value); setCustom(""); }}
        aria-pressed={active}
        className="mia-q-amt"
        style={{ ...chip(active), position: "relative", minWidth: 84, justifyContent: "center", display: "inline-flex", alignItems: "center" }}
      >
        <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(value)}</span>
        {i === SUGGESTED ? <span className="mia-q-tag">{t("suggestedAmount")}</span> : null}
      </button>
    );
  });

  const customInput = (
    <label className="mia-q-custom" data-active={custom ? "true" : "false"}>
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder={t("customAmount")}
        aria-label={t("customAmount")}
      />
      <span dir="ltr" aria-hidden="true">{currency}</span>
    </label>
  );

  const trustLine = (
    <span className="mia-q-trust">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>{tSystem("secureConnection")}</span>
      <span aria-hidden="true" className="mia-q-trust-dot">·</span>
      <span>{t("receipt")}</span>
    </span>
  );

  const donateButton = (size: "lg" | "md") => (
    <button type="button" onClick={submit} className="mia-q-cta" data-size={size} disabled={!(total > 0)}>
      <span>{t("donateNow")}</span>
      <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
    </button>
  );

  return (
    <>
      <section
        id="quick"
        ref={cardRef}
        data-qopen={open ? "true" : "false"}
        style={{ position: "relative", zIndex: 40, marginTop: 26, scrollMarginTop: 120 }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
          {/* ── Desktop card ─────────────────────────────────────────── */}
          <div className="mia-qdesk mia-q-card">
            <div aria-hidden="true" data-aqsa-pattern="" className="mia-q-pattern" />
            <span aria-hidden="true" className="mia-q-rule" />

            <div className="mia-q-head">
              <span className="mia-q-title">
                <span aria-hidden="true" className="mia-q-dot" />
                {tHome("quickDonateTitle")}
              </span>
              <span className="mia-q-steps" aria-hidden="true">
                <span><i>1</i>{tHome("pathStep1Title")}</span>
                <span><i>2</i>{tHome("pathStep2Title")}</span>
                <span><i>3</i>{tHome("pathStep3Title")}</span>
              </span>
            </div>

            <div className="mia-q-grid">
              <div className="mia-q-col">
                <span className="mia-q-label"><i>1</i>{tHome("pathStep1Title")}</span>
                <div className="mia-q-row">{destinationChips}{projectSelect}</div>
                <span className="mia-q-label" style={{ marginTop: 6 }}>{t("frequency")}</span>
                <div className="mia-q-row">{freqChips}</div>
              </div>

              <div className="mia-q-col">
                <span className="mia-q-label"><i>2</i>{tHome("pathStep2Title")}</span>
                <div className="mia-q-row mia-q-row--amounts">{amountChips}</div>
                {customInput}

                <div className="mia-q-summary">
                  <span className="mia-q-total">
                    <span>{t("total")}</span>
                    <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
                    <span className="mia-q-freq">· {freqLabel}</span>
                  </span>
                  <span className="mia-q-dest">{destinationLabel}</span>
                </div>
              </div>

              <div className="mia-q-col mia-q-col--cta">
                <span className="mia-q-label"><i>3</i>{tHome("pathStep3Title")}</span>
                {donateButton("lg")}
                {trustLine}
              </div>
            </div>
          </div>

          {/* ── Phone sheet ──────────────────────────────────────────── */}
          <div className="mia-qm">
            {open ? <div className="mia-qm-scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
            <div className="mia-qm-body">
              <span className="mia-qm-handle" aria-hidden="true" />
              <div className="mia-q-col">
                <span className="mia-q-label"><i>1</i>{tHome("pathStep1Title")}</span>
                <div className="mia-q-row">{destinationChips}</div>
                {projectSelect}
              </div>
              <div className="mia-q-col">
                <span className="mia-q-label">{t("frequency")}</span>
                <div className="mia-q-row">{freqChips}</div>
              </div>
              <div className="mia-q-col">
                <span className="mia-q-label"><i>2</i>{tHome("pathStep2Title")}</span>
                <div className="mia-q-row mia-q-row--amounts">{amountChips}</div>
                {customInput}
              </div>
              {trustLine}
            </div>

            <div className="mia-qm-bar">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mia-qm-toggle"
                aria-label={tHome("quickDonateTitle")}
                aria-expanded={open}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
              <button type="button" onClick={() => setOpen((v) => !v)} className="mia-qm-summary" aria-expanded={open}>
                <span>{destinationLabel}</span>
                <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
                <span className="mia-q-freq">· {freqLabel}</span>
              </button>
              {donateButton("md")}
            </div>
          </div>
        </div>
      </section>

      {/* ── Slim bar once the card has scrolled away (desktop only) ───────── */}
      <div className="mia-qsticky" data-stuck={stuck ? "true" : "false"} aria-hidden={!stuck}>
        <div className="mia-qsticky-inner">
          <span className="mia-q-title">
            <span aria-hidden="true" className="mia-q-dot" />
            {tHome("quickDonateTitle")}
          </span>
          <span className="mia-qsticky-summary">
            <span>{destinationLabel}</span>
            <b dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
            <span className="mia-q-freq">· {freqLabel}</span>
          </span>
          <button type="button" onClick={scrollToCard} className="mia-qsticky-edit">{t("editAmount")}</button>
          {donateButton("md")}
        </div>
      </div>
    </>
  );
}
