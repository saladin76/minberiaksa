import type { CSSProperties, ReactNode } from "react";

/**
 * Media primitives ported from the design-system bundle
 * (`Minbar/_ds/<ds>/_ds_bundle.js` → `components/media/*.jsx`).
 */

/* ── ReelCard ────────────────────────────────────────────────────────────────
 * Vertical 9:16 impact reel card — poster image, dark base, a play glyph and a
 * short caption pinned to the bottom. Used in the "Impact Reels" rail. */
export interface ReelCardProps {
  title: ReactNode;
  image?: string;
  href?: string;
  badge?: ReactNode;
  /** Accessible name for the play affordance; the glyph itself is decorative. */
  playLabel?: string;
  style?: CSSProperties;
}

export function ReelCard({ title, image, href = "#", badge, playLabel, style }: ReelCardProps) {
  return (
    <a
      href={href}
      style={{
        position: "relative",
        display: "block",
        aspectRatio: "9 / 16",
        borderRadius: "var(--r)",
        overflow: "hidden",
        background: "var(--deep)",
        boxShadow: "var(--shadow)",
        ...style,
      }}
    >
      {image ? (
        <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg, rgba(16,33,43,.78), transparent 55%)",
        }}
      />
      <span
        aria-hidden="true"
        title={playLabel}
        style={{
          position: "absolute",
          top: 14,
          insetInlineEnd: 14,
          display: "grid",
          placeItems: "center",
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "rgba(255,253,248,.92)",
          color: "var(--red)",
        }}
      >
        {/* Drawn, not a glyph font or emoji — the handoff mandates real SVG icons. */}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M8 5.5v13l11-6.5-11-6.5Z" />
        </svg>
      </span>
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: 14,
            insetInlineStart: 14,
            borderRadius: "var(--r)",
            background: "rgba(255,253,248,.92)",
            color: "var(--red)",
            padding: "6px 9px",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          {badge}
        </span>
      ) : null}
      <b style={{ position: "absolute", insetInline: 16, bottom: 16, color: "#fff", fontSize: 15, lineHeight: 1.25 }}>
        {title}
      </b>
    </a>
  );
}

/* ── StoryCircle ─────────────────────────────────────────────────────────────
 * Story entry used in the homepage story rail. Gold ring, red→gold gradient
 * bubble, short label and a micro caption. Horizontal-scrolls on mobile. */
export interface StoryCircleProps {
  label: ReactNode;
  image?: string;
  caption?: ReactNode;
  index?: number;
  href?: string;
  style?: CSSProperties;
}

export function StoryCircle({ label, image, caption, index, href = "#", style }: StoryCircleProps) {
  const initial =
    index != null ? index : typeof label === "string" && label.length ? label.slice(0, 1) : "•";
  return (
    <a
      href={href}
      style={{ display: "grid", minWidth: 118, gap: 5, justifyItems: "center", textAlign: "center", ...style }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 64,
          height: 64,
          borderRadius: "50%",
          border: "3px solid var(--gold)",
          background: image ? `center/cover url(${image})` : "linear-gradient(135deg, var(--red), var(--gold))",
          color: "#fff",
          fontWeight: 900,
        }}
      >
        {image ? null : initial}
      </span>
      <b style={{ fontSize: 14 }}>{label}</b>
      {caption ? <small style={{ color: "var(--muted)" }}>{caption}</small> : null}
    </a>
  );
}
