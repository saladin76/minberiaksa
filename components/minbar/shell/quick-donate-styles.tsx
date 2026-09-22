import type { CSSProperties } from "react";

/**
 * The look of the quick-donation panel — `Minbar/التبرع السريع.dc.html`.
 *
 * Used by the pill every inner page carries (`shell/QuickDonate`). The
 * homepage has its own sticky bar (`home/QuickDonateBar`) and no pill. Here
 * a row in the project list, a frequency pill and an amount
 * pill look the same wherever the panel opens.
 */

export const QF_PANEL: CSSProperties = {
  width: "min(288px,92vw)",
  boxSizing: "border-box",
  padding: 16,
  background: "#fff",
  border: "1px solid rgba(211,154,39,.5)",
  borderRadius: 14,
  boxShadow: "0 22px 48px rgba(16,33,43,.18)",
  display: "grid",
  gap: 12,
  overflow: "hidden",
};

export const QF_PILL: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  height: 50,
  padding: "0 20px",
  border: 0,
  borderRadius: 999,
  background: "linear-gradient(135deg, #C2453A, #8E2A20)",
  color: "#fff",
  fontFamily: "inherit",
  fontWeight: 900,
  fontSize: 14.5,
  cursor: "pointer",
  boxShadow: "0 14px 30px rgba(169,52,40,.38), inset 0 0 0 1px rgba(255,255,255,.16)",
  whiteSpace: "nowrap",
  maxWidth: "100%",
  boxSizing: "border-box",
};

export const QF_LEGEND: CSSProperties = { fontSize: 11, fontWeight: 900, color: "#52616B", letterSpacing: ".06em", padding: 0 };

export const QF_PICKER_TRIGGER: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 40,
  border: "1px solid rgba(16,33,43,.12)",
  borderRadius: 10,
  padding: "0 12px",
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 800,
  color: "#10212B",
  background: "#fff",
  cursor: "pointer",
};

export const QF_PICKER_LIST: CSSProperties = {
  marginTop: 6,
  maxHeight: 260,
  overflowY: "auto",
  border: "1px solid rgba(16,33,43,.12)",
  borderRadius: 10,
  background: "#fff",
};

export const QF_GROUP_ROW: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 12px",
  background: "#F7F2EA",
  border: 0,
  borderTop: "1px solid rgba(16,33,43,.08)",
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 900,
  color: "#52616B",
  letterSpacing: ".04em",
  cursor: "pointer",
};

export const QF_CUSTOM_INPUT: CSSProperties = {
  width: "100%",
  height: 40,
  marginTop: 6,
  padding: "0 13px",
  borderRadius: 10,
  border: "1px solid rgba(16,33,43,.12)",
  background: "#fff",
  fontFamily: "inherit",
  fontSize: 13.5,
  fontWeight: 800,
  color: "#10212B",
  boxSizing: "border-box",
};

export const QF_SUBMIT: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 44,
  border: 0,
  borderRadius: 999,
  background: "#A93428",
  color: "#fff",
  fontFamily: "inherit",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
};

/** A row in the project list; the chosen one sits on a sand tint. */
export function qfRowStyle(selected: boolean): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px",
    background: selected ? "#FDF3DD" : "transparent",
    border: 0,
    borderTop: "1px solid rgba(16,33,43,.06)",
    fontFamily: "inherit",
    fontSize: 12.5,
    fontWeight: selected ? 900 : 700,
    color: selected ? "#10212B" : "#52616B",
    cursor: "pointer",
  };
}

/** A frequency pill; gold when it is the one chosen. */
export function qfFreqStyle(checked: boolean): CSSProperties {
  return {
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    borderRadius: 999,
    border: `1px solid ${checked ? "#D39A27" : "rgba(16,33,43,.12)"}`,
    background: checked ? "#D39A27" : "#fff",
    color: checked ? "#fff" : "#10212B",
    fontSize: 12,
    fontWeight: checked ? 900 : 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  };
}

/** An amount pill; the chosen one goes deep navy. */
export function qfAmountStyle(featured: boolean): CSSProperties {
  return {
    minWidth: 0,
    height: 36,
    padding: "0 2px",
    borderRadius: 999,
    border: `1px solid ${featured ? "#10212B" : "rgba(16,33,43,.12)"}`,
    background: featured ? "#10212B" : "#fff",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: featured ? 900 : 800,
    color: featured ? "#fff" : "#10212B",
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export function QfChevron({ open, size = 14 }: { open?: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s ease" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function QfCheck() {
  return (
    <span style={{ display: "inline-flex", color: "#A93428" }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

/** The bolt on the closed pill, the cross on the open one. */
export function QfPillIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />}
    </svg>
  );
}

/** The "continue" arrow on the submit button; points at the end edge. */
export function QfSubmitArrow({ dir }: { dir: "rtl" | "ltr" }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: dir === "ltr" ? "scaleX(-1)" : undefined }}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}
