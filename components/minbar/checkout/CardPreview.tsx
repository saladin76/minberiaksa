"use client";

/**
 * The live card that fills in as the donor types and flips to its back when the
 * CVC field takes focus. Ported from the card block in
 * `Minbar/بيانات الدفع.dc.html`.
 *
 * Purely decorative: it mirrors what the donor has typed so they can check it
 * against the card in their hand. Nothing here is submitted, stored, or read
 * back — the values live only in the form's own state for the length of the
 * page view.
 *
 * The card face is always `dir="ltr"`: a card number, expiry and holder name are
 * Latin-script data and must not be reordered by an RTL context.
 */
export default function CardPreview({
  number,
  name,
  expiry,
  cvc,
  flipped,
}: {
  number: string;
  name: string;
  expiry: string;
  cvc: string;
  flipped: boolean;
}) {
  /* Grouped into fours, with the remaining positions shown as dots so the card
     reads as a card from the first keystroke rather than growing from nothing. */
  const digits = number.replace(/[^0-9]/g, "").slice(0, 16);
  const display = digits.padEnd(16, "•").replace(/(.{4})/g, "$1 ").trim();

  return (
    <div aria-hidden="true" style={{ width: "min(340px, 100%)", margin: "0 auto 6px", aspectRatio: 1.586, perspective: 1000 }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform .55s cubic-bezier(.22,.61,.36,1)",
          transform: flipped ? "rotateY(180deg)" : undefined,
        }}
      >
        {/* Front */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: 14,
            background: "linear-gradient(150deg, #17333F, #10212B)",
            border: "1px solid rgba(211,154,39,.4)",
            boxShadow: "0 16px 34px rgba(16,33,43,.22)",
            overflow: "hidden",
            padding: 18,
            display: "grid",
            alignContent: "space-between",
            color: "#fff",
          }}
        >
          <span style={{ position: "absolute", insetInlineStart: -30, bottom: -30, width: 150, height: 150, borderRadius: "50%", background: "rgba(211,154,39,.08)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ width: 38, height: 27, borderRadius: 5, background: "linear-gradient(150deg, #E8B94E, var(--gold))", display: "grid", placeItems: "center" }}>
              <span style={{ width: 26, height: 17, border: "1px solid rgba(16,33,43,.4)", borderRadius: 3 }} />
            </span>
            <img src="/minbar/assets/logo-mark.png" alt="" style={{ height: 26, width: "auto", opacity: 0.85 }} />
          </div>
          <b dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "center", fontSize: "clamp(16px, 5vw, 19px)", letterSpacing: "2.5px", fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {display}
          </b>
          <div dir="ltr" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: ".08em" }}>CARD HOLDER</span>
              <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
                {name || "—"}
              </span>
            </span>
            <span style={{ display: "grid", gap: 2, textAlign: "end" }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,.5)", letterSpacing: ".08em" }}>VALID THRU</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{expiry || "MM/YY"}</span>
            </span>
          </div>
        </div>

        {/* Back */}
        <div
          dir="ltr"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: 14,
            background: "linear-gradient(150deg, #132C38, #0C1B23)",
            border: "1px solid rgba(211,154,39,.4)",
            boxShadow: "0 16px 34px rgba(16,33,43,.22)",
            overflow: "hidden",
            display: "grid",
            alignContent: "start",
            gap: 14,
            padding: "16px 0",
            color: "#fff",
          }}
        >
          <span style={{ display: "block", width: "100%", height: 38, background: "#0A141A", marginTop: 4 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
            <span style={{ flex: "1 1 auto", height: 30, borderRadius: 5, background: "repeating-linear-gradient(45deg, #E9E4D8 0 6px, #DDD5C4 6px 12px)" }} />
            <span style={{ flex: "0 0 auto", minWidth: 52, height: 30, borderRadius: 5, background: "#fff", color: "#10212B", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: 2 }}>
              {cvc || "•••"}
            </span>
          </div>
          <span style={{ padding: "0 18px", fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,.45)", letterSpacing: ".08em", textAlign: "end" }}>CVC</span>
        </div>
      </div>
    </div>
  );
}
