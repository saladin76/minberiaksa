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
 * Every choice is one tap and goes straight on; nothing is preselected, so a
 * plan is never started by a tap meant for something else. One-time stays a
 * full-width button of its own, not a buried link.
 *
 * Rendered into `.mia-scope` rather than `body`: the design tokens live on that
 * element, and the cards it opens from sit in rails whose transforms would trap
 * a `position: fixed` child.
 */

export type GiveIntent = "donate" | "cart";

/** The hadith is quoted in its original wording in every language. */
const HADITH = "أحبُّ الأعمالِ إلى اللهِ أدومُها وإنْ قَلّ";

const RECURRING: ReadonlyArray<{ id: Exclude<CartFreqKey, "once">; label: string; per: string; desc: string; icon: ReactElement }> = [
  {
    id: "monthly",
    label: "monthly",
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
    label: "everyFriday",
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
    label: "daily",
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
  intent,
  projectTitle,
  amountLabel,
  onPick,
  onClose,
}: {
  /** Null while closed. */
  intent: GiveIntent | null;
  projectTitle: string;
  amountLabel: string;
  /** `origin` is the option pressed, for the fly-to-basket animation. */
  onPick: (freq: CartFreqKey, origin: HTMLElement) => void;
  onClose: () => void;
}) {
  const t = useTranslations("CardGive");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const titleId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector(".mia-scope") ?? document.body);
  }, []);

  /* Escape closes and the page behind stays put, as in the other overlays. */
  useEffect(() => {
    if (!intent) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    firstRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [intent, onClose]);

  if (!intent || !host) return null;

  const isArabic = locale.startsWith("ar");

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
          {RECURRING.map((option, index) => (
            <button
              key={option.id}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              className={`fq-option${index === 0 ? " fq-option--featured" : ""}`}
              onClick={(e) => onPick(option.id, e.currentTarget)}
            >
              {index === 0 ? <span className="fq-badge">{t("recommended")}</span> : null}
              <span className="fq-icon">{option.icon}</span>
              <span className="fq-text">
                <b>{tCommon(option.label)}</b>
                <small>{t(option.desc)}</small>
              </span>
              <span className="fq-price">
                <b dir="ltr">{amountLabel}</b>
                <small>{t(option.per)}</small>
              </span>
            </button>
          ))}

          <button type="button" className="fq-once" onClick={(e) => onPick("once", e.currentTarget)}>
            {t("onceOnly", { amount: amountLabel })}
          </button>

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
