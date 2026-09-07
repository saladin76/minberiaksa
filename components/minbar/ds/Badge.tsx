import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Small label used for project categories (Gaza / Al-Quds / Waqf / Zakat), the
 * "Official Minber" tag over project images, and status pills.
 *
 * Ported from the design-system bundle
 * (`Minbar/_ds/<ds>/_ds_bundle.js` → `components/badges/Badge.jsx`). The tone
 * colours resolve through CSS variables, so the locked palette in
 * `styles/minbar/minbar.css` — not the design-system defaults — is what renders.
 */
export type BadgeTone = "gold" | "red" | "green" | "deep" | "onImage";

const TONES: Record<BadgeTone, { fg: string; bg: string; bd: string }> = {
  gold: { fg: "var(--gold)", bg: "rgba(211,154,39,.12)", bd: "rgba(211,154,39,.32)" },
  red: { fg: "var(--red)", bg: "rgba(169,52,40,.10)", bd: "rgba(169,52,40,.30)" },
  green: { fg: "var(--green)", bg: "rgba(31,122,77,.12)", bd: "rgba(31,122,77,.30)" },
  deep: { fg: "var(--deep)", bg: "rgba(16,33,43,.06)", bd: "var(--border)" },
  onImage: { fg: "var(--red)", bg: "rgba(255,253,248,.92)", bd: "transparent" },
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  children?: ReactNode;
  tone?: BadgeTone;
  solid?: boolean;
  style?: CSSProperties;
}

export default function Badge({
  children,
  tone = "gold",
  solid = false,
  style,
  ...rest
}: BadgeProps) {
  const t = TONES[tone] ?? TONES.gold;
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: "var(--r)",
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: ".01em",
    color: solid ? "#fff" : t.fg,
    background: solid ? t.fg : t.bg,
    border: `1px solid ${solid ? t.fg : t.bd}`,
    ...style,
  };
  return (
    <span style={base} {...rest}>
      {children}
    </span>
  );
}
