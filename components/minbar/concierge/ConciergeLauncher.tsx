"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";
import { QUICK_DONATE_ROUTES, type MinbarRoute } from "@/lib/minbar/routes";
import { Block } from "./ConciergeBlocks";
import { useConcierge } from "./useConcierge";
import { useConciergeConfig } from "./useConciergeConfig";

/* Remembered so the pulse stops once the visitor has found the assistant, and the
   teaser bubble is offered at most once per visit. */
const SEEN_KEY = "mia_concierge_seen";
const TEASER_KEY = "mia_concierge_teaser_done";
const TEASER_VISIBLE_MS = 14_000;
const MOBILE_POS_KEY = "mia_concierge_mobile_pos_v2";

function readFlag(storage: "local" | "session", key: string): boolean {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage: "local" | "session", key: string): void {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, "1");
  } catch {
    /* Private mode: the bubble may show again; harmless. */
  }
}

/**
 * The donation concierge's entry point and panel.
 *
 * A pill in the bottom inline-end corner  stacked above the quick-donation
 * pill on the pages that carry it  opens a sheet: full-height from the
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
  const { config } = useConciergeConfig();
  /* null until read on the client, so the server render never guesses. */
  const [seen, setSeen] = useState<boolean | null>(null);
  const [teaserOpen, setTeaserOpen] = useState(false);
  const launcherWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [mobileOffset, setMobileOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(MOBILE_POS_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { x?: number; y?: number };
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        setMobileOffset({ x: Number(parsed.x), y: Number(parsed.y) });
      }
    } catch {
      /* A private session simply starts from the default corner. */
    }
  }, []);

  useEffect(() => {
    setSeen(readFlag("local", SEEN_KEY));
  }, []);

  /* Opening the panel once is enough: the pulse and the teaser retire. */
  useEffect(() => {
    if (!open) return;
    setTeaserOpen(false);
    writeFlag("session", TEASER_KEY);
    if (!readFlag("local", SEEN_KEY)) {
      writeFlag("local", SEEN_KEY);
      setSeen(true);
    }
  }, [open]);
  const threadRef = useRef<HTMLDivElement>(null);

  /* Bring the visitor's latest message to the top of the thread, so the
     reply unfolds beneath it and is read from its first line  not from
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

  /* The teaser: a short invitation beside the launcher, once per visit, after
     the delay set in the dashboard; it leaves by itself after a while. */
  const hiddenHere = !route || HIDDEN_ROUTES.has(route);
  useEffect(() => {
    if (hiddenHere || open || !config.enabled || !config.teaser || window.matchMedia("(max-width: 760px)").matches || readFlag("session", TEASER_KEY)) return;
    const show = window.setTimeout(() => setTeaserOpen(true), Math.max(0, config.teaserDelaySeconds) * 1000);
    return () => window.clearTimeout(show);
  }, [hiddenHere, open, config.enabled, config.teaser, config.teaserDelaySeconds]);
  useEffect(() => {
    if (!teaserOpen) return;
    const hide = window.setTimeout(() => {
      setTeaserOpen(false);
      writeFlag("session", TEASER_KEY);
    }, TEASER_VISIBLE_MS);
    return () => window.clearTimeout(hide);
  }, [teaserOpen]);

  if (hiddenHere || !config.enabled) return null;
  const abovePill = pillPresent;
  const dismissTeaser = () => {
    setTeaserOpen(false);
    writeFlag("session", TEASER_KEY);
  };

  const persistMobileOffset = (next: { x: number; y: number }) => {
    setMobileOffset(next);
    try { window.sessionStorage.setItem(MOBILE_POS_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  const onLauncherPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia("(min-width: 761px)").matches) return;
    const wrap = launcherWrapRef.current;
    if (!wrap) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: mobileOffset.x,
      originY: mobileOffset.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onLauncherPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const wrap = launcherWrapRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !wrap) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;

    const rect = wrap.getBoundingClientRect();
    const margin = 12;
    const minDx = margin - rect.left;
    const maxDx = window.innerWidth - margin - rect.right;
    const minDy = margin - rect.top;
    const maxDy = window.innerHeight - margin - rect.bottom;
    const next = {
      x: mobileOffset.x + Math.max(minDx, Math.min(maxDx, dx - (mobileOffset.x - drag.originX))),
      y: mobileOffset.y + Math.max(minDy, Math.min(maxDy, dy - (mobileOffset.y - drag.originY))),
    };
    setMobileOffset(next);
  };

  const onLauncherPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const wrap = launcherWrapRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;

    if (!drag.moved || !wrap) return;
    suppressClickRef.current = true;

    const rect = wrap.getBoundingClientRect();
    const margin = 14;
    const leftGap = rect.left - margin;
    const rightGap = window.innerWidth - margin - rect.right;
    const snapDx = leftGap <= rightGap ? -leftGap : rightGap;
    const next = { x: mobileOffset.x + snapDx, y: mobileOffset.y };
    persistMobileOffset(next);

    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  return (
    <>
      {!open ? (
        <div
          ref={launcherWrapRef}
          className="cg-launch-wrap"
          data-above-pill={abovePill ? "1" : "0"}
          data-draggable="1"
          dir={dir}
          style={{ transform: `translate3d(${mobileOffset.x}px, ${mobileOffset.y}px, 0)` }}
        >
          {teaserOpen ? (
            <div className="cg-teaser" role="status">
              <button type="button" className="cg-teaser-body" onClick={() => openPanel()}>
                <b>{t("teaserTitle")}</b>
                <span>{t("teaserBody")}</span>
              </button>
              <button type="button" className="cg-teaser-x" onClick={dismissTeaser} aria-label={t("close")}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : null}
          <span className="cg-halo" data-pulse={config.pulse && seen === false ? "1" : "0"}>
          <button
            type="button"
            className="cg-launcher"
            aria-haspopup="dialog"
            onPointerDown={onLauncherPointerDown}
            onPointerMove={onLauncherPointerMove}
            onPointerUp={onLauncherPointerUp}
            onPointerCancel={() => { dragRef.current = null; }}
            onClick={() => { if (!suppressClickRef.current) openPanel(); }}
          >
            <span className="cg-launcher-icon" aria-hidden="true">
              <SparkGlyph />
            </span>
            <span className="cg-launcher-label">{t("launcher")}</span>
            <span className="cg-launcher-badge" aria-hidden="true">AI</span>
          </button>
          </span>
        </div>
      ) : null}

      {open ? (
        <div className="cg-backdrop" onClick={close} aria-hidden="true" />
      ) : null}

      <section className="cg-sheet" data-open={open ? "1" : "0"} dir={dir} role="dialog" aria-modal="true" aria-label={t("title")} aria-hidden={!open}>
        <header className="cg-head">
          <span className="cg-head-icon" aria-hidden="true">
            <ConciergeLogo onDark />
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
              <div className="cg-thinking" aria-live="polite">
                <span className="cg-thinking-orb" aria-hidden="true">
                  <ConciergeLogo onDark />
                </span>
                <span className="cg-thinking-line" aria-hidden="true" />
                <span className="cg-sr">{t("thinking")}</span>
              </div>
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

/** Four-point sparkles: the launcher's "try me" mark. */
function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
      <path d="M10 2.5c.4 3.9 2.1 6.1 6.5 6.9-4.4.8-6.1 3-6.5 6.9-.4-3.9-2.1-6.1-6.5-6.9 4.4-.8 6.1-3 6.5-6.9Z" />
      <path d="M18.2 13.2c.2 2 1.1 3.1 3.3 3.5-2.2.4-3.1 1.5-3.3 3.5-.2-2-1.1-3.1-3.3-3.5 2.2-.4 3.1-1.5 3.3-3.5Z" opacity=".85" />
    </svg>
  );
}

/**
 * The foundation's mark as the assistant's face. Original colours on a light
 * surface; on a dark one (`onDark`) it is turned white so it reads against it.
 */
function ConciergeLogo({ onDark = false }: { onDark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logometaminber.avif" alt="" width={22} height={22} className={`cg-logo${onDark ? " cg-logo-on-dark" : ""}`} aria-hidden="true" />
  );
}
