"use client";

import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { localeDirection } from "@/lib/locales";

/**
 * Horizontally scrolling rail with prev / next controls.
 *
 * Ported from `Component.nudge()` in the handoff pages. The scroll arithmetic
 * has to account for RTL: in a right-to-left container `scrollLeft` runs from
 * `-max` (the end) up to `0` (the start), so the same "next" gesture moves the
 * value in the opposite sign from LTR. The arrow glyphs mirror with direction
 * too — "next" points at the start edge in RTL.
 */
export interface RailProps {
  children: ReactNode;
  /** Pixels moved per press. Matches the card pitch of the rail's content. */
  step: number;
  prevLabel: string;
  nextLabel: string;
  /** Rendered above the rail, opposite the controls. */
  heading?: ReactNode;
  /** Rendered beside the controls — typically a "view all" link. */
  action?: ReactNode;
  style?: CSSProperties;
  controlStyle?: "square" | "rounded";
  id?: string;
}

export default function Rail({
  children,
  step,
  prevLabel,
  nextLabel,
  heading,
  action,
  style,
  controlStyle = "rounded",
  id,
}: RailProps) {
  const locale = useLocale();
  const rtl = localeDirection(locale) === "rtl";
  const ref = useRef<HTMLDivElement>(null);

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const el = ref.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      // A right-to-left container reports scrollLeft <= 0.
      const isRtlScroll = el.scrollLeft <= 0;
      const current = el.scrollLeft;
      const target = isRtlScroll
        ? Math.min(0, Math.max(-max, current + direction * step))
        : Math.max(0, Math.min(max, current - direction * step));
      el.scrollTo({ left: target, behavior: "smooth" });
    },
    [step]
  );

  const button = (direction: 1 | -1, label: string, glyph: "prev" | "next") => (
    <button
      type="button"
      onClick={() => nudge(direction)}
      aria-label={label}
      className="mia-rail-btn"
      style={{
        flex: "0 0 auto",
        width: 46,
        height: 46,
        display: "inline-grid",
        placeItems: "center",
        border: "1px solid rgba(211,154,39,.45)",
        borderRadius: controlStyle === "square" ? 8 : 10,
        background: "#fff",
        cursor: "pointer",
        color: "var(--deep)",
        transition: "all .15s ease",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          // "prev" points at the start edge, "next" at the end edge, whichever
          // side those are in this direction.
          transform: (glyph === "prev") === rtl ? "scaleX(-1)" : undefined,
        }}
      >
        <path d="M14 6l-6 6 6 6" />
      </svg>
    </button>
  );

  return (
    <div style={style}>
      {heading || action ? (
        <div
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          {heading}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {action}
            {button(1, prevLabel, "prev")}
            {button(-1, nextLabel, "next")}
          </div>
        </div>
      ) : null}
      <div
        ref={ref}
        id={id}
        className="mia-rail"
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          padding: "10px 4px 8px",
          marginTop: -10,
          scrollBehavior: "smooth",
        }}
      >
        {children}
      </div>
    </div>
  );
}
