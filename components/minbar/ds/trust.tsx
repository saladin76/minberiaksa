import type { CSSProperties, ReactNode } from "react";

/**
 * Trust primitives ported from the design-system bundle
 * (`Minbar/_ds/<ds>/_ds_bundle.js` → `components/trust/*.jsx`).
 */

/* ── StatMetric ──────────────────────────────────────────────────────────────
 * A single big impact stat. Large figure (deep / red / gold), small caption
 * below. Shows a clear placeholder when data is unconfirmed — the brand never
 * invents impact numbers, so `unverifiedLabel` renders `common.toBeVerified`. */
export interface StatMetricProps {
  value?: ReactNode;
  label: ReactNode;
  tone?: "deep" | "red" | "gold";
  verified?: boolean;
  /** Localised "to be verified" note, shown when `verified` is false. */
  unverifiedLabel?: ReactNode;
  style?: CSSProperties;
}

export function StatMetric({
  value = "—",
  label,
  tone = "deep",
  verified = true,
  unverifiedLabel,
  style,
}: StatMetricProps) {
  const color = tone === "red" ? "var(--red)" : tone === "gold" ? "var(--gold)" : "var(--deep)";
  return (
    <div style={{ display: "grid", gap: 4, ...style }}>
      <b style={{ fontSize: "clamp(30px,4vw,44px)", lineHeight: 1, color, fontWeight: 900 }}>{value}</b>
      <span style={{ color: "var(--muted)", fontSize: 14 }}>{label}</span>
      {!verified && unverifiedLabel ? (
        <small style={{ color: "var(--gold)", fontWeight: 800 }}>{unverifiedLabel}</small>
      ) : null}
    </div>
  );
}

/* ── TrustList ───────────────────────────────────────────────────────────────
 * Proof-path list. Each row carries the brand's gold inline-start rule on a
 * sand background — used for "every intention has its own proof path", trust
 * points and update timelines. */
export interface TrustListProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  items?: ReactNode[];
  style?: CSSProperties;
}

export function TrustList({ eyebrow, title, items = [], style }: TrustListProps) {
  return (
    <aside style={{ display: "grid", gap: 12, ...style }}>
      {eyebrow ? (
        <p style={{ margin: 0, color: "var(--gold)", fontWeight: 900, fontSize: 13, textTransform: "uppercase" }}>
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2 style={{ margin: "0 0 4px", fontSize: "clamp(24px,3vw,34px)", lineHeight: 1.1 }}>{title}</h2>
      ) : null}
      {items.map((item, i) => (
        <span
          key={i}
          style={{
            borderInlineStart: "4px solid var(--gold)",
            borderRadius: "var(--r)",
            background: "var(--sand)",
            padding: "12px 14px",
            fontWeight: 800,
            color: "var(--deep)",
          }}
        >
          {item}
        </span>
      ))}
    </aside>
  );
}
