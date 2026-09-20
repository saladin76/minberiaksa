import type { CSSProperties } from "react";
import type { ThanksCopy } from "@/lib/certificates/copy-defaults";

/**
 * The thank-you certificate sheet — `handoff-certificates/شهادة الشكر لوحة.dc.html`,
 * the plaque alone: no buttons, nothing that touches the host page.
 *
 * The same component is the live preview on the success page, the standalone
 * print page, and the sheet the server turns into the PDF, so it takes no
 * hooks: every string arrives as a prop, resolved by the caller from the i18n
 * bundle and the dashboard's overrides (`lib/certificates/copy.ts`). It scales
 * from its own width via container query units, so one set of sizes serves
 * the 1060px sheet, a scaled preview and the A4 print.
 *
 * The two verses are always the Arabic text (`quran` namespace,
 * RELIGIOUS_LOCKED). Outside an Arabic edition the meaning follows beneath in
 * the reader's language, as `CERTIFICATES_DOWNLOADS_HANDOFF.md §8` requires.
 */

export interface CertificateVerse {
  arabic: string;
  /** Translation of the meaning; null in an Arabic edition. */
  translation: string | null;
}

export interface ThanksCertificateProps {
  /** The name engraved on the plaque. Empty renders a blank line to write on. */
  donorName: string;
  copy: ThanksCopy;
  /** Al-Baqarah 261, at the head of the plaque. */
  verse: CertificateVerse;
  /** Al-Baqarah 110, the closing supplication. */
  duaVerse: CertificateVerse;
  /** `rtl` for Arabic and Urdu editions, `ltr` otherwise. */
  dir: "rtl" | "ltr";
  /** Origin to prefix asset paths with when the sheet renders outside the site. */
  assetBase?: string;
}

const GOLD = "#D39A27";
const SERIF = "var(--font-amiri), Amiri, serif";
const SANS = "var(--font-cairo), Cairo, system-ui, sans-serif";

/* The woven gold ground of the sheet, as the template draws it. Inline rather
   than a class so the PDF renderer needs no stylesheet. */
const GROUND: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: [
    "radial-gradient(circle at 50% 40%, rgba(255,255,255,.9) 0 38%, rgba(247,242,234,.55) 100%)",
    "repeating-conic-gradient(from 45deg at 0 0, rgba(211,154,39,.13) 0deg 90deg, transparent 90deg 180deg) 0 0/30px 30px",
    "radial-gradient(circle at 0 0, transparent 68%, rgba(211,154,39,.16) 69% 71%, transparent 72%) 0 0/30px 30px",
    "radial-gradient(circle at 100% 100%, transparent 68%, rgba(211,154,39,.16) 69% 71%, transparent 72%) 0 0/30px 30px",
    "repeating-linear-gradient(45deg, rgba(211,154,39,.07) 0 1px, transparent 1px 15px)",
    "repeating-linear-gradient(-45deg, rgba(211,154,39,.07) 0 1px, transparent 1px 15px)",
  ].join(", "),
};

const corner = (v: "top" | "bottom", h: "start" | "end"): CSSProperties => ({
  position: "absolute",
  [v]: "2.4%",
  [h === "start" ? "insetInlineStart" : "insetInlineEnd"]: "2.4%",
  width: 92,
  height: 92,
  [v === "top" ? "borderTop" : "borderBottom"]: `6px solid ${GOLD}`,
  [h === "start" ? "borderInlineStart" : "borderInlineEnd"]: `6px solid ${GOLD}`,
});

export default function ThanksCertificate({ donorName, copy, verse, duaVerse, dir, assetBase = "" }: ThanksCertificateProps) {
  const asset = (file: string) => `${assetBase}/minbar/assets/${file}`;

  return (
    <div
      className="cert-sheet"
      dir={dir}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 1060,
        margin: "0 auto",
        aspectRatio: "1.414/1",
        containerType: "inline-size",
        background: "#FFFEFB",
        boxShadow: "0 26px 70px rgba(16,33,43,.18)",
        overflow: "hidden",
        fontFamily: SANS,
        color: "#10212B",
      }}
    >
      <div aria-hidden="true" style={GROUND} />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative sheet artwork, sized in container units */}
      <img src={asset("aqsa-dome-line.png")} alt="" aria-hidden="true" style={{ position: "absolute", insetInline: "26%", bottom: "5%", width: "48%", height: "auto", opacity: 0.09, pointerEvents: "none" }} />

      {/* Three nested rules and four corner brackets — the plaque's frame. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "2.4%", border: `2.5px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "3.6%", border: "1px solid rgba(211,154,39,.55)" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "4.8%", border: "1px dashed rgba(211,154,39,.5)" }} />
      <div aria-hidden="true" style={corner("top", "start")} />
      <div aria-hidden="true" style={corner("top", "end")} />
      <div aria-hidden="true" style={corner("bottom", "start")} />
      <div aria-hidden="true" style={corner("bottom", "end")} />

      <div className="cert-body" style={{ position: "relative", height: "100%", padding: "3.2% 9% 2.4%", display: "grid", gridTemplateRows: "auto auto 1fr auto", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- sized as a share of the sheet, not in pixels */}
          <img src={asset("logo-horizontal.png")} alt={copy.orgName} style={{ width: "20%", maxWidth: 190, height: "auto" }} />
          <span dir="rtl" style={{ marginTop: 14, fontFamily: SERIF, fontSize: "clamp(11px,1.5cqw,20px)", color: "#10212B", letterSpacing: ".02em" }}>
            بسم الله الرحمن الرحيم
          </span>
          <p dir="rtl" style={{ margin: 0, width: "100%", fontFamily: SERIF, fontSize: "clamp(12px,1.78cqw,25px)", fontWeight: 700, lineHeight: 1.9, color: "#7C2318", whiteSpace: "nowrap" }}>
            {verse.arabic}
          </p>
          {verse.translation ? (
            <p style={{ margin: 0, width: "82%", fontSize: "clamp(9px,1.05cqw,14px)", lineHeight: 1.7, color: "#7C2318", opacity: 0.85 }}>{verse.translation}</p>
          ) : null}
        </div>

        <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "1.6% 0" }}>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "clamp(34px,5.4cqw,74px)", fontWeight: 700, letterSpacing: ".04em", color: "#A93428", lineHeight: 1.35, whiteSpace: "nowrap" }}>
            {copy.title}
          </h1>
        </div>

        <div className="cert-main" style={{ display: "grid", alignContent: "center", justifyItems: "center", gap: 16 }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 6, width: "100%" }}>
            <span style={{ fontSize: "clamp(11px,1.5cqw,20px)", fontWeight: 700, color: "#52616B", whiteSpace: "nowrap" }}>{copy.nameLabel}</span>
            {/* The name line keeps its height when empty, so a certificate
                printed before the donor typed a name has a rule to write on. */}
            <span style={{ display: "grid", placeItems: "center", width: "100%", minHeight: 44, padding: "4px 6px", fontSize: "clamp(18px,2.95cqw,40px)", fontWeight: 800, color: "#10212B", whiteSpace: "nowrap" }}>
              {donorName}
            </span>
          </div>

          <p style={{ margin: 0, width: "82%", fontSize: "clamp(11px,1.44cqw,19px)", lineHeight: 2.05, color: "#132C38" }}>{copy.body}</p>

          <p dir="rtl" style={{ margin: "6px 0 0", width: "100%", fontFamily: SERIF, fontSize: "clamp(13px,2cqw,28px)", fontWeight: 700, lineHeight: 1.8, color: "#7C2318", whiteSpace: "nowrap" }}>
            {duaVerse.arabic}
          </p>
          {duaVerse.translation ? (
            <p style={{ margin: 0, width: "82%", fontSize: "clamp(9px,1.05cqw,14px)", lineHeight: 1.7, color: "#7C2318", opacity: 0.85 }}>{duaVerse.translation}</p>
          ) : null}
          <p style={{ margin: 0, width: "82%", fontSize: "clamp(12px,1.62cqw,21px)", lineHeight: 2.05, color: "#132C38" }}>{copy.duaText}</p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: "2.2%", alignSelf: "end" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- sized in container units */}
          <img src={asset("cert-seal-alpha.png")} alt="" aria-hidden="true" style={{ width: "clamp(66px,7.4cqw,112px)", height: "auto" }} />
          <div style={{ display: "grid", justifyItems: "end", gap: 6, textAlign: "end" }}>
            <span style={{ fontFamily: SERIF, fontSize: "clamp(13px,1.6cqw,23px)", fontWeight: 700, color: "#B8811C", whiteSpace: "nowrap" }}>{copy.motto}</span>
            <span style={{ fontSize: "clamp(10px,1.2cqw,16px)", fontWeight: 700, color: "#132C38", whiteSpace: "nowrap" }}>{copy.orgName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
