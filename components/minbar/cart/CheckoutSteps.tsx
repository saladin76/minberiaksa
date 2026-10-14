"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

export interface CheckoutStep {
  n: number;
  label: string;
  current: boolean;
  /** Whether the donor may go there yet. A current step is never a link. */
  enabled: boolean;
  href?: string;
  onSelect?: () => void;
}

/**
 * The cart → details → confirmation rail shared by `/cart` and `/checkout`.
 * A step is a link (or a button, for one reached by an action rather than a
 * URL) only once the donor has what it needs; otherwise it's shown muted.
 */
export function CheckoutSteps({ id, steps }: { id: string; steps: CheckoutStep[] }) {
  return (
    <ol id={id} style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", listStyle: "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
      {steps.map((step, i) => {
        const pill: CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          padding: "8px 14px",
          borderRadius: 999,
          border: `1px solid ${step.current ? "var(--gold)" : "var(--border)"}`,
          background: step.current ? "#fff" : "transparent",
          color: step.current ? "var(--deep)" : "var(--muted)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 800,
          whiteSpace: "nowrap",
          transition: "border-color .18s ease",
          opacity: step.current || step.enabled ? 1 : 0.55,
          cursor: step.current ? "default" : step.enabled ? "pointer" : "not-allowed",
        };
        const content = (
          <>
            <span
              className="cart-step-n"
              style={{
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                width: 22,
                height: 22,
                aspectRatio: "1",
                borderRadius: "50%",
                background: step.current ? "var(--gold)" : "var(--border)",
                color: step.current ? "#10212B" : "var(--muted)",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {step.n}
            </span>
            {step.label}
          </>
        );
        const clickable = !step.current && step.enabled;
        return (
          <li key={step.n} style={{ display: "contents" }}>
            {clickable && step.href ? (
              <Link href={step.href} className="cart-step" style={pill}>
                {content}
              </Link>
            ) : clickable && step.onSelect ? (
              <button type="button" onClick={step.onSelect} className="cart-step" style={pill}>
                {content}
              </button>
            ) : (
              <span className="cart-step is-static" aria-current={step.current ? "step" : undefined} aria-disabled={step.current ? undefined : true} style={pill}>
                {content}
              </span>
            )}
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="cart-step-line" style={{ flex: "1 1 24px", maxWidth: 60, height: 1, background: "var(--border)" }} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
