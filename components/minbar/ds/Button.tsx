"use client";

import type { CSSProperties, ElementType, MouseEvent, ReactNode } from "react";

/**
 * Minber-i Aksa button.
 * The brand's action language: heavy weight (900), 8px radius, ~46px tall.
 * `primary` = red with a soft red glow — used for EVERY main donate CTA.
 *
 * Ported from the design-system bundle
 * (`Minbar/_ds/<ds>/_ds_bundle.js` → `components/buttons/Button.jsx`).
 */
export type ButtonVariant = "primary" | "gold" | "support" | "light" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { minHeight: 40, padding: "8px 14px", fontSize: 13 },
  md: { minHeight: 46, padding: "12px 18px", fontSize: 15 },
  lg: { minHeight: 54, padding: "15px 26px", fontSize: 16 },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  // main donate / conversion action
  primary: {
    background: "var(--red)",
    color: "#fff",
    border: "1px solid var(--red)",
    boxShadow: "var(--shadow-cta)",
  },
  // gold accent action (secondary emphasis, e.g. Calculate Zakat cross-links)
  gold: {
    background: "var(--gold)",
    color: "#fff",
    border: "1px solid var(--gold)",
    boxShadow: "0 12px 24px rgba(211,154,39,.22)",
  },
  // support / continuity action (recurring, zakat rails)
  support: {
    background: "var(--green)",
    color: "#fff",
    border: "1px solid var(--green)",
    boxShadow: "0 12px 24px rgba(31,122,77,.20)",
  },
  // light: white with hairline border — the standard secondary
  light: { background: "#fff", color: "var(--deep)", border: "1px solid var(--border)" },
  // outline: transparent, for use ON dark/photo surfaces
  outline: { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.34)" },
  // ghost text link
  ghost: {
    background: "transparent",
    color: "var(--red)",
    border: "1px solid transparent",
    boxShadow: "none",
  },
};

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Element to render when there is no `href`. Defaults to `button`. */
  as?: ElementType;
  href?: string;
  full?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit" | "reset";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  className?: string;
  title?: string;
  "aria-label"?: string;
  target?: string;
  rel?: string;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  as,
  href,
  full = false,
  disabled = false,
  style,
  ...rest
}: ButtonProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: full ? "100%" : undefined,
    borderRadius: "var(--r)",
    fontFamily: "inherit",
    fontWeight: 900,
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "transform .15s ease, filter .15s ease, background .15s ease",
    textDecoration: "none",
    ...SIZES[size],
    ...VARIANTS[variant],
    ...style,
  };

  const Tag = (href ? "a" : (as ?? "button")) as ElementType;
  // `type` only means anything on a real <button>; leaving it on an <a> is
  // invalid HTML and React will warn.
  const typeAttr = !href && (as ?? "button") === "button" ? { type: rest.type ?? "button" } : {};
  const { type: _ignored, ...forward } = rest;

  return (
    <Tag
      href={href}
      style={base}
      aria-disabled={disabled || undefined}
      onMouseDown={(e: MouseEvent<HTMLElement>) => {
        if (!disabled) e.currentTarget.style.transform = "translateY(1px)";
      }}
      onMouseUp={(e: MouseEvent<HTMLElement>) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
      onMouseLeave={(e: MouseEvent<HTMLElement>) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
      {...typeAttr}
      {...forward}
    >
      {children}
    </Tag>
  );
}
