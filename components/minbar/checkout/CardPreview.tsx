"use client";

/** Layout uses normal flow so long names and translated labels never overlap.
 * Only the final four digits are mirrored outside the actual secure inputs. */
export function CardPreview({ number, name, expiry, expiryLabel }: { number: string; name: string; expiry: string; expiryLabel: string }) {
  const digits = number.replace(/\D/g, "");
  const brand = /^4/.test(digits) ? "VISA" : /^(5[1-5]|2[2-7])/.test(digits) ? "Mastercard" : /^3[47]/.test(digits) ? "AMEX" : /^9792/.test(digits) ? "TROY" : "";
  return <div aria-hidden="true" className="pay-card-display" dir="ltr" style={{ width: "min(280px,100%)", minHeight: 166, boxSizing: "border-box", display: "grid", gap: 14, padding: 20, borderRadius: 18, background: "linear-gradient(135deg,#203d49,#10212b)", color: "#fff", boxShadow: "0 10px 26px rgba(16,33,43,.15)", fontFamily: "Arial,sans-serif" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 22 }}><span style={{ display: "block", width: 33, height: 24, borderRadius: 5, background: "#d6b45d" }} /><b style={{ fontSize: 14 }}>{brand}</b></div>
    <div style={{ fontSize: 20, letterSpacing: 2, whiteSpace: "nowrap" }}>•••• •••• •••• {digits.length >= 4 ? digits.slice(-4) : "••••"}</div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "end", gap: 12 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{name || "—"}</span>
      <span style={{ display: "grid", gap: 3, textAlign: "right" }}><span style={{ maxWidth: 100, fontSize: 9 }}>{expiryLabel}</span><b style={{ fontSize: 13, whiteSpace: "nowrap" }}>{expiry || "••/••"}</b></span>
    </div>
  </div>;
}
