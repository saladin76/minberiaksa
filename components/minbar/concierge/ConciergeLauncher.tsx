"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { QUICK_DONATE_ROUTES, type MinbarRoute } from "@/lib/minbar/routes";
import { Block } from "./ConciergeBlocks";
import { useConcierge } from "./useConcierge";

/**
 * The donation concierge's entry point and panel.
 *
 * A pill in the bottom inline-end corner — stacked above the quick-donation
 * pill on the pages that carry it — opens a sheet: full-height from the
 * bottom on a phone, a side panel on wider screens. It never opens by itself;
 * the project page and other CTAs open it through `openConcierge()`.
 *
 * Hidden on the transactional pages (basket, checkout, payment states,
 * success): a donor who is paying should not be interrupted.
 */

const HIDDEN_ROUTES: ReadonlySet<MinbarRoute> = new Set<MinbarRoute>([
  "cart",
  "checkout",
  "donationSuccess",
  "paymentFailed",
  "paymentCancelled",
  "paymentProcessing",
  "paymentPending",
  "receipt",
  "waqfCertificate",
  "thanksCertificate",
]);

export default function ConciergeLauncher() {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("Concierge");
  const { open, loading, turns, route, openPanel, close, restart, send, act, addDonation, addWaqf } = useConcierge();
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  /* Bring the visitor's latest message to the top of the thread, so the
     reply unfolds beneath it and is read from its first line — not from
     the bottom of a long answer. Before any message, the top of the panel. */
  useEffect(() => {
    if (!open) return;
    const el = threadRef.current;
    if (!el) return;
    const users = el.querySelectorAll<HTMLElement>(".cg-turn-user");
    const last = users[users.length - 1];
    el.scrollTo({ top: last ? Math.max(0, last.offsetTop - el.offsetTop - 8) : 0, behavior: "smooth" });
  }, [turns, loading, open]);

  /* While the sheet is open the homepage's fixed quick-donate bar, which sits
     above it in z-order, is hidden through this flag (see minbar.css). */
  useEffect(() => {
    document.documentElement.classList.toggle("cg-open", open);
    return () => document.documentElement.classList.remove("cg-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /* Sit above the quick-donate pill only when it is actually on the page:
     the pill's routes are an allowlist, but the component itself may render
     nothing, and the launcher must not float over an empty corner. */
  const [pillPresent, setPillPresent] = useState(false);
  useEffect(() => {
    if (!route || !QUICK_DONATE_ROUTES.has(route)) {
      setPillPresent(false);
      return;
    }
    const check = () => setPillPresent(Boolean(document.querySelector("#quick-fab .qf-handle")));
    check();
    const timer = window.setTimeout(check, 600);
    return () => window.clearTimeout(timer);
  }, [route]);

  if (!route || HIDDEN_ROUTES.has(route)) return null;
  const abovePill = pillPresent;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="cg-launcher"
          data-above-pill={abovePill ? "1" : "0"}
          dir={dir}
          aria-haspopup="dialog"
          onClick={() => openPanel()}
        >
          <span className="cg-launcher-icon" aria-hidden="true">
            <ConciergeGlyph />
          </span>
          <span className="cg-launcher-label">{t("launcher")}</span>
        </button>
      ) : null}

      {open ? (
        <div className="cg-backdrop" onClick={close} aria-hidden="true" />
      ) : null}

      <section className="cg-sheet" data-open={open ? "1" : "0"} dir={dir} role="dialog" aria-modal="true" aria-label={t("title")} aria-hidden={!open}>
        <header className="cg-head">
          <span className="cg-head-icon" aria-hidden="true">
            <ConciergeGlyph />
          </span>
          <div className="cg-head-text">
            <b>{t("title")}</b>
            <span>{t("s_welcome")}</span>
          </div>
          <button type="button" className="cg-icon-btn" onClick={restart} aria-label={t("restart")} title={t("restart")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
          </button>
          <button type="button" className="cg-icon-btn" onClick={close} aria-label={t("close")}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="cg-thread" ref={threadRef}>
          {turns.map((turn) => (
            <div key={turn.id} className={`cg-turn cg-turn-${turn.role}`}>
              {turn.error ? (
                <>
                  <p className="cg-bubble">{t("errorGeneric")}</p>
                  <div className="cg-actions">
                    <button type="button" className="cg-chip" onClick={() => act({ type: "navigate", label: t("a_projects"), route: "projects" })}>{t("a_projects")}</button>
                    <button type="button" className="cg-chip" onClick={() => act({ type: "navigate", label: t("a_zakat_page"), route: "zakat" })}>{t("a_zakat_page")}</button>
                    <button type="button" className="cg-chip" onClick={() => act({ type: "navigate", label: t("a_waqf_page"), route: "waqf" })}>{t("a_waqf_page")}</button>
                    <button type="button" className="cg-chip" onClick={() => act({ type: "navigate", label: t("a_recurring_page"), route: "recurring" })}>{t("a_recurring_page")}</button>
                  </div>
                </>
              ) : (
                <>
                  {turn.text ? <p className="cg-bubble">{turn.text}</p> : null}
                  {turn.blocks.map((block, i) => (
                    <Block key={`${turn.id}-${i}`} block={block} onAction={act} onAdd={addDonation} onAddWaqf={addWaqf} busy={loading} />
                  ))}
                  {turn.actions.length ? (
                    <div className="cg-actions">
                      {turn.actions.map((action, i) => (
                        <button
                          key={`${turn.id}-a${i}`}
                          type="button"
                          className={`cg-chip${action.type === "checkout" ? " cg-chip-primary" : ""}`}
                          disabled={loading}
                          onClick={() => act(action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
          {loading ? (
            <div className="cg-turn cg-turn-assistant">
              <p className="cg-bubble cg-bubble-thinking" aria-live="polite">
                <span className="cg-dot" /><span className="cg-dot" /><span className="cg-dot" />
                <span className="cg-sr">{t("thinking")}</span>
              </p>
            </div>
          ) : null}
        </div>

        <form className="cg-composer" onSubmit={onSubmit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="cg-input cg-composer-input"
            maxLength={600}
            autoComplete="off"
          />
          <button type="submit" className="cg-send" disabled={loading || !draft.trim()} aria-label={t("send")}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: dir === "rtl" ? "scaleX(-1)" : undefined }}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </section>
    </>
  );
}

/** Two open hands under a small crescent — giving, not a robot. */
function ConciergeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5a4.2 4.2 0 1 0 3.2 6.9 3.3 3.3 0 1 1-3.2-6.9Z" />
      <path d="M3 14.5c2.2-1.2 3.6-1.1 5.2.2l2.4 1.9c.9.7.8 1.9-.3 2.2l-2.1.6" />
      <path d="M21 14.5c-2.2-1.2-3.6-1.1-5.2.2l-2.4 1.9c-.9.7-.8 1.9.3 2.2l2.1.6" />
      <path d="M8 21h8" />
    </svg>
  );
}
