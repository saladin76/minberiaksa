"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { addToCart, type CartFreqKey } from "@/lib/minbar/cart";
import { useMinbarMoney } from "@/hooks/useMinbarMoney";
import type { MinbarProject } from "@/lib/minbar/projects";

/**
 * The quick-donation card under the urgent projects, and the dock that follows
 * it once it is out of sight.
 *
 * The card is a form with three inputs and a receipt, in the shape every
 * checkout already uses: the choices on one side, what they add up to on the
 * other.
 *
 *   amount → destination → frequency          |  الإجمالي  US$300
 *                                             |  شهريًا · حيث الحاجة أشد
 *                                             |  [ تبرّع الآن ]
 *
 *   · Amount first and largest. It is the decision a donor actually arrives
 *     with; the middle preset is marked as suggested and selected, so the card
 *     is answerable with one press.
 *   · The destination is ONE native select — the generic intentions first,
 *     then every project under a group.
 *   · The frequency is one segmented control, so it reads as one setting with
 *     four states.
 *   · The panel restates the whole decision in words before the button.
 *
 * The dock. Two earlier attempts at keeping the donation within reach were
 * removed for good reasons: a 68px strip pinned under the header covered the
 * navigation and took a slice of every screen from the first paint, and a
 * bottom sheet whose first press only expanded it added a step to giving.
 * This dock keeps the reach and drops the cost:
 *
 *   · It lives at the BOTTOM edge, where nothing else of the page's own sits,
 *     never under the header.
 *   · It appears only after the visitor has scrolled past the landing AND the
 *     card itself is not on screen — so it is never a second copy of what is
 *     already visible, and never a nag on arrival. It slides away the moment
 *     the card scrolls back into view.
 *   · On a desktop it is one bar: the four presets, the running summary and
 *     the button. A donor can change the amount and give without scrolling
 *     back; anything else ("edit") scrolls them to the card.
 *   · On a phone the bar is the total and the button. The button gives
 *     directly — the bar already shows the amount, frequency and destination,
 *     so there is nothing hidden behind the press. Tapping the summary opens
 *     the full form as a sheet above the bar for the donor who wants to
 *     change something.
 *   · There is no close button. It is small, it sits where nothing else of
 *     the page's own does, and it leaves by itself whenever the card is in
 *     view — so it stays within reach for the whole visit.
 *
 * The card and the dock are one state: a preset chosen in the dock is the
 * preset the card shows, and vice versa.
 *
 * Everything held here is an identifier, never a displayed string: the
 * destination is a project slug or a generic key, the frequency is
 * `once`/`daily`/`friday`/`monthly`. Storing a label would send Arabic text to
 * the cart from a French session the moment the labels were translated.
 *
 * The donate action adds to the basket and routes to the cart — the same path
 * as "add to basket" on a project card.
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

/** The dock waits until the landing has been scrolled past. */
const DOCK_AFTER_PX = 320;
/** Below this the dock is the phone bar + sheet; above it, the desktop bar. */
const PHONE_QUERY = "(max-width: 900px)";

export default function QuickDonateBar({ projects }: { projects: MinbarProject[] }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");
  const tHome = useTranslations("homepage");
  const tNav = useTranslations("navigation");
  const tSystem = useTranslations("system");
  const { format, symbol } = useMinbarMoney();

  const [destination, setDestination] = useState<string>("where-needed");
  const [freq, setFreq] = useState<CartFreqKey>("once");
  const [amount, setAmount] = useState<number>(AMOUNTS[SUGGESTED]);
  /** null = a preset is selected; a string = the free field is in use. */
  const [custom, setCustom] = useState<string | null>(null);

  /** The card is off screen and the page has been scrolled past the landing. */
  const [docked, setDocked] = useState(false);
  /** The phone sheet is expanded above the bar. */
  const [open, setOpen] = useState(false);

  const cardRef = useRef<HTMLElement | null>(null);

  const label = (ns: string, key: string) =>
    ns === "common" ? t(key) : ns === "navigation" ? tNav(key) : tHome(key);

  const isGeneric = GENERIC_DESTINATIONS.some((d) => d.id === destination);
  const destinationLabel = useMemo(() => {
    const g = GENERIC_DESTINATIONS.find((d) => d.id === destination);
    if (g) return label(g.ns, g.key);
    return projects.find((p) => p.slug === destination)?.title ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, projects, locale]);

  const total = custom !== null ? Number(custom || 0) : amount;
  const freqLabel = t(FREQUENCIES.find((f) => f.id === freq)?.key ?? "oneTime");
  const canGive = total > 0;

  /* ── Dock visibility ──────────────────────────────────────────────────
     Shown when the card is not in the viewport and the page is scrolled past
     the landing. Both are checked together, so scrolling back to the card
     hides the dock and scrolling to the top hides it too. */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let cardVisible = true;
    const update = () => setDocked(!cardVisible && window.scrollY > DOCK_AFTER_PX);
    const io = new IntersectionObserver(([entry]) => { cardVisible = entry.isIntersecting; update(); }, { threshold: 0.12 });
    io.observe(el);
    window.addEventListener("scroll", update, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", update); };
  }, []);

  const show = docked;

  /* The sheet closes itself when the dock goes away, on Escape, and when the
     viewport grows past phone width (where the sheet has no meaning). */
  useEffect(() => { if (!show) setOpen(false); }, [show]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const mq = window.matchMedia(PHONE_QUERY);
    const onMq = () => { if (!mq.matches) setOpen(false); };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => { window.removeEventListener("keydown", onKey); mq.removeEventListener("change", onMq); };
  }, [open]);

  /* Mirrored onto <body>: the WhatsApp button steps up while the dock is
     shown, and the page stops scrolling under the open sheet. */
  useEffect(() => {
    const b = document.body;
    if (show) b.setAttribute("data-quick-dock", "true"); else b.removeAttribute("data-quick-dock");
    if (open) b.setAttribute("data-quick-open", "true"); else b.removeAttribute("data-quick-open");
    return () => { b.removeAttribute("data-quick-dock"); b.removeAttribute("data-quick-open"); };
  }, [show, open]);

  const scrollToCard = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const submit = () => {
    if (!canGive) return;
    addToCart(
      isGeneric
        ? {
            titleKey: destination === "where-needed" ? "whereNeedGreatest" : destination,
            typeKey: "project",
            freqKey: freq,
            amount: total,
            currency: "USD",
          }
        : { projectId: destination, typeKey: "project", freqKey: freq, amount: total, currency: "USD" }
    );
    router.push(miaPath("cart", locale));
  };

  /* ── The three inputs, rendered by the card and again by the phone sheet.
     `id` keeps the label/aria ids unique between the two copies; `live` is the
     copy the visitor is looking at, the only one that takes focus. */
  const fields = (id: string, live: boolean) => (
    <>
      {/* 1 — amount, the decision the donor arrives with */}
      <div className="mia-qd-field">
        <span className="mia-qd-legend" id={`${id}-amount`}>{t("amount")}</span>
        <div className="mia-qd-amounts" role="group" aria-labelledby={`${id}-amount`}>
          {AMOUNTS.map((value, i) => {
            const active = custom === null && amount === value;
            return (
              <button
                key={value}
                type="button"
                className="mia-qd-amt"
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => { setAmount(value); setCustom(null); }}
              >
                <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(value)}</span>
                {i === SUGGESTED ? <i className="mia-qd-tag">{t("suggestedAmount")}</i> : null}
              </button>
            );
          })}
          <button
            type="button"
            className="mia-qd-amt mia-qd-amt--other"
            data-active={custom !== null ? "true" : "false"}
            aria-pressed={custom !== null}
            onClick={() => setCustom(custom === null ? "" : null)}
          >
            {tSystem("otherAmount")}
          </button>
        </div>

        {custom !== null ? (
          <label className="mia-qd-custom">
            <span className="mia-qd-cur" dir="ltr">{symbol}</span>
            <input
              autoFocus={live}
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))}
              inputMode="numeric"
              placeholder={t("customAmount")}
              aria-label={t("customAmount")}
            />
          </label>
        ) : null}
      </div>

      {/* 2 — where it goes: one control, generic intentions then projects */}
      <div className="mia-qd-field">
        <label className="mia-qd-legend" htmlFor={`${id}-destination`}>{tHome("projectSelectLabel")}</label>
        <div className="mia-qd-select">
          <select id={`${id}-destination`} value={destination} onChange={(e) => setDestination(e.target.value)}>
            {GENERIC_DESTINATIONS.map((d) => (
              <option key={d.id} value={d.id}>{label(d.ns, d.key)}</option>
            ))}
            {projects.length ? (
              <optgroup label={tNav("projects")}>
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* 3 — how often: one setting, four states */}
      <div className="mia-qd-field">
        <span className="mia-qd-legend" id={`${id}-freq`}>{t("frequency")}</span>
        <div className="mia-qd-seg" role="group" aria-labelledby={`${id}-freq`}>
          {FREQUENCIES.map((f) => {
            const active = freq === f.id;
            return (
              <button
                key={f.id}
                type="button"
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => setFreq(f.id)}
              >
                {t(f.key)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  const trust = (
    <p className="mia-qd-trust">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>{tSystem("secureConnection")}</span>
      <span>{t("receipt")}</span>
    </p>
  );

  return (
    <>
      <section id="quick" ref={cardRef} className="mia-qd-sec">
        <div className="mia-qd">
          <div aria-hidden="true" data-aqsa-pattern="" className="mia-qd-pattern" />

          {/* ── The choices ─────────────────────────────────────────────── */}
          <div className="mia-qd-main">
            <h2 className="mia-qd-title">
              <span aria-hidden="true" className="mia-qd-dot" />
              {tHome("quickDonateTitle")}
            </h2>
            {fields("qd", !open)}
          </div>

          {/* ── What it adds up to ──────────────────────────────────────── */}
          <aside className="mia-qd-aside">
            <span className="mia-qd-sum-label">{t("total")}</span>
            <b className="mia-qd-sum" style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
            <p className="mia-qd-sum-meta">
              <span>{freqLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="mia-qd-sum-dest">{destinationLabel}</span>
            </p>

            <button type="button" className="mia-qd-cta" onClick={submit} disabled={!canGive}>
              {t("donateNow")}
            </button>

            {trust}
          </aside>
        </div>
      </section>

      {/* ── The dock: the card's summary, within reach once the card is not. */}
      <div
        className="mia-qdock"
        data-on={show ? "true" : "false"}
        data-open={open ? "true" : "false"}
        aria-hidden={!show}
        // Nothing inside is reachable by keyboard while it is off screen.
        inert={!show}
      >
        {open ? <div className="mia-qdock-scrim" onClick={() => setOpen(false)} aria-hidden="true" /> : null}

        {/* Phone only: the full form as a sheet above the bar. */}
        <div className="mia-qdock-sheet" id="qdock-sheet" role="region" aria-label={tHome("quickDonateTitle")}>
          <span aria-hidden="true" className="mia-qdock-handle" />
          {fields("qdock", open)}
          {trust}
        </div>

        <div className="mia-qdock-bar">
          <span className="mia-qdock-title">
            <span aria-hidden="true" className="mia-qd-dot" />
            {tHome("quickDonateTitle")}
          </span>

          {/* Desktop only: the presets inline, so the amount can change here. */}
          <div className="mia-qdock-amts" role="group" aria-label={t("amount")}>
            {AMOUNTS.map((value) => {
              const active = custom === null && amount === value;
              return (
                <button
                  key={value}
                  type="button"
                  data-active={active ? "true" : "false"}
                  aria-pressed={active}
                  onClick={() => { setAmount(value); setCustom(null); }}
                >
                  <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{format(value)}</span>
                </button>
              );
            })}
          </div>

          {/* The summary: on a phone it opens the sheet; on a desktop it scrolls
              to the card, which is where the destination and frequency live. */}
          <button
            type="button"
            className="mia-qdock-sum"
            onClick={() => (window.matchMedia(PHONE_QUERY).matches ? setOpen((v) => !v) : scrollToCard())}
            aria-expanded={open}
            aria-controls="qdock-sheet"
          >
            <b style={{ unicodeBidi: "isolate" }}>{format(total || 0)}</b>
            <span className="mia-qdock-meta">
              <span>{freqLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="mia-qdock-dest">{destinationLabel}</span>
            </span>
            <span className="mia-qdock-edit">{t("editAmount")}</span>
            <svg className="mia-qdock-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>

          <button type="button" className="mia-qdock-cta" onClick={submit} disabled={!canGive}>
            {t("donateNow")}
          </button>
        </div>
      </div>
    </>
  );
}
