"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import type { CartFreqKey } from "@/lib/minbar/cart";

/**
 * "How should this gift continue?"  asked between a card's amount and the
 * basket, so a donor who came for one gift is shown, at the moment of giving,
 * that the same amount can keep giving.
 *
 * The four ways to give are equal cards the donor picks between (one-time looks
 * like the others, not like a way out). The campaign's recommended cadence
 * (`MinbarProject.recommendedFrequency`, monthly unless the dashboard says
 * otherwise) carries the badge and starts selected; with none recommended,
 * nothing is. The two actions at the end then donate now or add to the basket.
 *
 * Rendered into `.mia-scope` rather than `body`: the design tokens live on that
 * element, and the cards it opens from sit in rails whose transforms would trap
 * a `position: fixed` child.
 */

export type GiveIntent = "donate" | "cart";

/** The hadith is quoted in its original wording in every language. */
const HADITH = "أحبُّ الأعمالِ إلى اللهِ أدومُها وإنْ قَلّ";

/* One-time first, then the cadences. */
const OPTIONS: ReadonlyArray<{ id: CartFreqKey; label: string; per: string; desc: string; icon: ReactElement }> = [
  {
    id: "once",
    label: "onceTitle",
    per: "perOnce",
    desc: "onceDesc",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
    ),
  },
  {
    id: "monthly",
    label: "monthlyTitle",
    per: "perMonth",
    desc: "monthlyDesc",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        <path d="m17 3 .6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6L17 3Z" />
      </svg>
    ),
  },
  {
    id: "friday",
    label: "fridayTitle",
    per: "perWeek",
    desc: "fridayDesc",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 20V12a7 7 0 0 1 14 0v8" />
        <path d="M12 5V2.5M3 20h18M10 20v-4a2 2 0 0 1 4 0v4" />
      </svg>
    ),
  },
  {
    id: "daily",
    label: "dailyTitle",
    per: "perDay",
    desc: "dailyDesc",
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
];

export default function GiveFrequencyDialog({
  open,
  projectTitle,
  amountLabel,
  recommended,
  onConfirm,
  onClose,
}: {
  open: boolean;
  projectTitle: string;
  amountLabel: string;
  /** The campaign's recommended cadence: badged and preselected. Null: none. */
  recommended: CartFreqKey | null;
  /** `origin` is the button pressed, for the fly-to-basket animation. */
  onConfirm: (freq: CartFreqKey, intent: GiveIntent, origin: HTMLElement) => void;
  onClose: () => void;
}) {
  const t = useTranslations("CardGive");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [selected, setSelected] = useState<CartFreqKey | null>(recommended);
  /* Bumped when an action is pressed with nothing chosen; keys the list so the
     shake replays. */
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    setHost(document.querySelector(".mia-scope") ?? document.body);
  }, []);

  /* Each opening starts from the campaign's recommendation. */
  useEffect(() => {
    if (open) {
      setSelected(recommended);
      setNudge(0);
    }
  }, [open, recommended]);

  /* Escape closes and the page behind stays put, as in the other overlays. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => {
      const target =
        listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
        listRef.current?.querySelector<HTMLButtonElement>("button");
      target?.focus({ preventScroll: true });
    });
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !host) return null;

  const isArabic = locale.startsWith("ar");
  const confirm = (intent: GiveIntent, origin: HTMLElement) => {
    if (!selected) {
      setNudge((n) => n + 1);
      return;
    }
    onConfirm(selected, intent, origin);
  };

  return createPortal(
    <div className="fq-backdrop" onClick={onClose}>
      <div
        className="fq-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fq-hero">
          <span className="fq-hero-pattern" aria-hidden="true" />
          <span className="fq-hero-glow" aria-hidden="true" />
          <button type="button" className="fq-close" onClick={onClose} aria-label={tCommon("close")}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* Eight-pointed star  the two squares of the rub el hizb. */}
          <svg className="fq-star" viewBox="0 0 64 64" width="58" height="58" aria-hidden="true">
            <g fill="none" stroke="#D39A27" strokeWidth="2" strokeLinejoin="round">
              <rect x="14" y="14" width="36" height="36" rx="2" />
              <rect x="14" y="14" width="36" height="36" rx="2" transform="rotate(45 32 32)" />
              <circle cx="32" cy="32" r="9" />
            </g>
            <circle cx="32" cy="32" r="3.2" fill="#D39A27" />
          </svg>

          <span className="fq-eyebrow">{t("eyebrow")}</span>
          <h2 id={titleId} className="fq-title">
            {t("title")}
          </h2>
          <p className="fq-lead">
            {t.rich("lead", {
              amount: () => (
                <b dir="ltr" className="fq-amount">
                  {amountLabel}
                </b>
              ),
              project: () => <b>{projectTitle}</b>,
            })}
          </p>

          <figure className="fq-hadith">
            <blockquote lang="ar" dir="rtl">
              «{HADITH}»
            </blockquote>
            {!isArabic ? <figcaption className="fq-hadith-meaning">{t("hadithMeaning")}</figcaption> : null}
            <figcaption className="fq-hadith-source">{t("hadithSource")}</figcaption>
          </figure>
        </div>

        <div className="fq-body">
          <div
            key={nudge}
            ref={listRef}
            role="radiogroup"
            aria-labelledby={titleId}
            className={`fq-options${nudge > 0 && !selected ? " fq-options--nudge" : ""}`}
          >
            {OPTIONS.map((option) => {
              const isRecommended = option.id === recommended;
              const isSelected = option.id === selected;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`fq-option${isRecommended ? " fq-option--featured" : ""}${isSelected ? " fq-option--selected" : ""}`}
                  onClick={() => setSelected(option.id)}
                >
                  {isRecommended ? <span className="fq-badge">{t("recommended")}</span> : null}
                  <span className="fq-radio" aria-hidden="true" />
                  <span className="fq-icon">{option.icon}</span>
                  <span className="fq-text">
                    <b>{t(option.label)}</b>
                    <small>{t(option.desc)}</small>
                  </span>
                  <span className="fq-price">
                    <b dir="ltr">{amountLabel}</b>
                    <small>{t(option.per)}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {nudge > 0 && !selected ? (
            <p className="fq-choose" role="alert">
              {t("chooseFirst")}
            </p>
          ) : null}

          <div className="fq-actions">
            <button type="button" className="fq-cta fq-cta--donate" onClick={(e) => confirm("donate", e.currentTarget)}>
              {tCommon("donateNow")}
            </button>
            <button type="button" className="fq-cta fq-cta--cart" onClick={(e) => confirm("cart", e.currentTarget)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 8 2 11h12l2-11H4Z" />
                <path d="m9 8 3-4 3 4M9 12v3M15 12v3" />
              </svg>
              {tCommon("addToCart")}
            </button>
          </div>

          <p className="fq-note">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6l-7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            {t("cancelNote")}
          </p>
        </div>
      </div>
    </div>,
    host
  );
}
