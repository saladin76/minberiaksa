import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Button } from "@/components/minbar/ds";

/**
 * The shared shape of every status screen — payment failed, cancelled,
 * processing, awaiting confirmation, technical error, maintenance, 404.
 *
 * Ported from the seven single-purpose pages in the handoff
 * (`فشل الدفع`, `إلغاء الدفع`, `معالجة الدفع`, `الدفع قيد التأكيد`,
 * `خطأ تقني`, `الصيانة`, `صفحة غير موجودة`), which share one layout: a tinted
 * circular glyph, a heading, a line of explanation, an optional detail panel,
 * and at most two ways out.
 *
 * Two ways out is the ceiling on purpose — the handoff's note on the 404 page
 * is that more exits scatter the decision rather than help it.
 */

export type StatusTone = "error" | "neutral" | "pending" | "success";

const TONES: Record<StatusTone, { color: string; background: string }> = {
  error: { color: "var(--red)", background: "rgba(169,52,40,.1)" },
  neutral: { color: "var(--muted)", background: "var(--sand)" },
  pending: { color: "var(--gold)", background: "rgba(211,154,39,.14)" },
  success: { color: "var(--green)", background: "rgba(31,122,77,.1)" },
};

export interface StatusScreenProps {
  tone: StatusTone;
  icon: ReactElement;
  title: string;
  lead: string;
  /** Label/value rows shown in a panel beneath the lead. */
  details?: Array<{ label: string; value: ReactNode; latin?: boolean }>;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Extra content between the lead and the actions. */
  children?: ReactNode;
  /** Adds a gentle attention animation. Off for calm states. */
  animate?: boolean;
}

export default function StatusScreen({
  tone,
  icon,
  title,
  lead,
  details,
  primary,
  secondary,
  children,
  animate = false,
}: StatusScreenProps) {
  const palette = TONES[tone];

  return (
    <section style={{ padding: "64px 24px 60px", display: "grid", justifyItems: "center", gap: 18, textAlign: "center" }}>
      <span
        className={animate ? "mia-status-glyph mia-status-glyph--animate" : "mia-status-glyph"}
        style={{ display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: "50%", background: palette.background, color: palette.color }}
      >
        {icon}
      </span>

      <h1 style={{ margin: 0, fontSize: "clamp(24px,2.8vw,32px)", fontWeight: 900 }}>{title}</h1>
      <p style={{ margin: 0, maxWidth: "48ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{lead}</p>

      {details?.length ? (
        <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 8, padding: 20, background: "#fff", border: "1px solid var(--border)", borderRadius: 12, textAlign: "start", marginTop: 8 }}>
          {details.map((row) => (
            <span key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ color: "var(--muted)" }}>{row.label}</span>
              {/* Reference numbers and amounts are Latin-script data. */}
              <b dir={row.latin ? "ltr" : undefined} style={row.latin ? latinValue : undefined}>
                {row.value}
              </b>
            </span>
          ))}
        </div>
      ) : null}

      {children}

      {primary || secondary ? (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
          {primary ? (
            <Button variant="primary" href={primary.href} style={{ whiteSpace: "nowrap" }}>
              {primary.label}
            </Button>
          ) : null}
          {secondary ? (
            <Button variant="light" href={secondary.href} style={{ whiteSpace: "nowrap" }}>
              {secondary.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const latinValue: CSSProperties = { unicodeBidi: "isolate" };
