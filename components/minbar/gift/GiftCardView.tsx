import type { CSSProperties } from "react";
import type { GiftCard } from "@/lib/donations/gift-order";
import { CARD_THEMES } from "@/lib/minbar/gift-page";

const SERIF = "Amiri, 'Noto Naskh Arabic', 'Traditional Arabic', serif";
const FONTS: Record<GiftCard["font"], string> = { naskh: SERIF, ruqaa: "'Aref Ruqaa', " + SERIF, modern: "inherit" };
const SIZES = { s: 15, m: 17, l: 20 } as const;
export const GIFT_LOGO_SRC = "/minbar/assets/logo-horizontal.png";
export const GIFT_SEAL_SRC = "/minbar/assets/cert-seal-alpha.png";

export type GiftCardLabels = { to: string; from: string; wishes: string; about: string; value: string; backNote: string; number: string; logo: string; seal: string };

/**
 * The gift card as designed (canvas "صفحة الإهداء"): the Minber logo on top, the text centred in
 * the middle, the giver and the gold seal at the foot. Used by the gift page (live preview) and by
 * the page the recipient opens; it renders the stored `giftCard` exactly, older cards included.
 */
export default function GiftCardView({ height, card, head, to, message, giftName, sign, kicker, side, labels, showValue }: {
  height: number; card: GiftCard; head: string; to: string; message: string; giftName: string; sign: string; kicker: string; side: "front" | "back"; labels: GiftCardLabels; showValue: boolean;
}) {
  const look = CARD_THEMES[card.theme] ?? CARD_THEMES.dome;
  const accent = card.accent === 1 || card.accent === 2 ? card.accent : 0;
  const bg = look.bg[accent], gold = look.accent[accent], ink = look.ink;
  const layout = card.layout ?? "classic", minimal = layout === "minimal", center = layout !== "classic";
  const fam = FONTS[card.font] ?? SERIF, px = SIZES[card.size ?? "m"];
  const showLogo = card.showLogo !== false, showSeal = card.showSeal !== false, pattern = card.pattern !== false && !minimal;
  // eslint-disable-next-line @next/next/no-img-element
  const logo = showLogo ? <img src={GIFT_LOGO_SRC} alt={labels.logo} style={{ display: "block", height: 30, width: "auto", filter: look.dark ? "brightness(0) invert(1)" : "none" }} /> : null;
  // eslint-disable-next-line @next/next/no-img-element
  const seal = (w: number) => (showSeal ? <img src={GIFT_SEAL_SRC} alt={labels.seal} width={w} height={w} style={{ display: "block", width: w, height: w, objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,.25))" }} /> : null);
  const rule: CSSProperties = { flex: "1 1 auto", maxWidth: 70, height: 1, background: gold, opacity: 0.7 };
  const id = "gc" + card.theme + accent;
  return (
    <div style={{ position: "relative", overflow: "hidden", height, padding: "24px 24px 20px", boxSizing: "border-box", borderRadius: 20, background: bg, color: ink,
      boxShadow: `inset 0 0 0 10px rgba(255,255,255,.04), inset 0 0 0 11px ${gold}88, inset 0 0 0 16px ${gold}44, 0 30px 60px -30px rgba(42,12,8,.75)` }}>
      {pattern ? <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: look.pattern }}><defs><pattern id={id} width="44" height="44" patternUnits="userSpaceOnUse"><path d="M22 3 L26 18 L41 22 L26 26 L22 41 L18 26 L3 22 L18 18 Z" fill="none" stroke={gold} strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill={`url(#${id})`} /></svg> : null}
      {!minimal && look.mark === "dome" ? <svg aria-hidden="true" width="150" height="90" viewBox="0 0 150 90" style={{ position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%)", opacity: 0.16 }}><path d="M10 90 V60 H140 V90 Z M30 60 Q75 0 120 60 Z M73 6 h4 v-6 h-4 Z" fill={gold} /></svg> : null}
      {!minimal && look.mark === "moon" ? <svg aria-hidden="true" width="40" height="40" viewBox="0 0 34 34" style={{ position: "absolute", top: 26, insetInlineEnd: 26, opacity: 0.55 }}><path d="M21.5 9.5a8.5 8.5 0 1 0 3 12.6A7 7 0 1 1 21.5 9.5z" fill={gold} /></svg> : null}
      {!minimal && look.mark === "leaves" ? <svg aria-hidden="true" width="120" height="120" viewBox="0 0 120 120" style={{ position: "absolute", top: -10, insetInlineEnd: -10, opacity: 0.5 }}><path d="M10 110 C40 70 70 50 110 10" stroke={gold} strokeWidth="2" fill="none" /><path d="M40 72 C30 60 34 48 46 44 C50 56 48 66 40 72 Z M62 52 C54 40 58 28 70 26 C72 38 70 46 62 52 Z M82 34 C76 24 80 14 90 12 C92 22 90 30 82 34 Z" fill={gold} /></svg> : null}
      {!minimal ? <>
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><g fill="none" stroke={gold} strokeWidth="1.3" opacity=".9"><path d="M22 46 V30 Q22 22 30 22 H46" /><path d="M28 40 V34 Q28 28 34 28 H40" /></g></svg>
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: "scaleX(-1)" }}><g fill="none" stroke={gold} strokeWidth="1.3" opacity=".9"><path d="M22 46 V30 Q22 22 30 22 H46" /><path d="M28 40 V34 Q28 28 34 28 H40" /></g></svg>
      </> : null}
      {side === "front" ? (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10, height: "100%", minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: "100%" }}>
            {logo}
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}><span style={rule} /><span style={{ color: gold, fontWeight: 700, textAlign: "center", ...(card.occasion === "memory" ? { fontSize: 15, fontFamily: SERIF } : { fontSize: 11, letterSpacing: ".12em" }) }}>{kicker}</span><span style={rule} /></span>
          </div>
          <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, alignItems: center ? "center" : "flex-start", textAlign: center ? "center" : "start" }}>
            <b style={{ fontFamily: fam, fontSize: px + 17, lineHeight: 1.25, fontWeight: 700, color: gold }}>{head}</b>
            <span style={{ fontSize: 13.5, fontWeight: 700, opacity: 0.9 }}>{labels.to} {to}</span>
            <p style={{ margin: 0, minHeight: 0, overflow: "hidden", fontFamily: fam, fontSize: px, lineHeight: 1.85 }}>{message}</p>
            <span style={{ fontSize: 12.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,.14)", border: `1px solid ${gold}`, color: gold }}>{giftName}</span>
          </div>
          <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: `1px solid ${gold}55`, paddingTop: 10 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 11.5, opacity: 0.8 }}>{labels.wishes}</span><span style={{ fontFamily: fam, fontSize: 17, fontWeight: 700, color: gold }}>{labels.from} {sign}</span></span>
            {seal(58)}
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12, height: "100%", justifyContent: "center", textAlign: "center", alignItems: "center" }}>
          {logo}
          <span style={{ color: gold, fontWeight: 700, fontSize: 11.5, letterSpacing: ".12em" }}>{labels.about}</span>
          <b style={{ fontFamily: SERIF, fontSize: 26, color: gold }}>{giftName}</b>
          {showValue ? <span style={{ fontSize: 15, fontWeight: 800 }}>{labels.value}</span> : null}
          <p style={{ margin: 0, maxWidth: "28ch", fontSize: 13.5, lineHeight: 1.8, opacity: 0.9 }}>{labels.backNote}</p>
          {seal(84)}
          <span style={{ fontSize: 12, opacity: 0.8 }}>{labels.number}</span>
        </div>
      )}
    </div>
  );
}
