import type { CSSProperties } from "react";
import type { ThanksCertificateProps } from "./ThanksCertificate";

/**
 * The thank-you certificate, portrait — `شهادة الشكر - احتياطي بالطول.dc.html`.
 *
 * The alternate layout: the landscape sheet is the one issued to donors and
 * emailed; this one is offered inside the dashboard only, for an admin who
 * wants a tall frame. Same props, same wording, laid out for A4 portrait.
 */

const GOLD = "#D39A27";
const SERIF = "var(--font-amiri), Amiri, serif";
const SANS = "var(--font-cairo), Cairo, system-ui, sans-serif";

const GROUND: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: [
    "radial-gradient(circle at 50% 34%, rgba(255,255,255,.9) 0 38%, rgba(247,242,234,.55) 100%)",
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

export default function ThanksCertificatePortrait({ donorName, copy, verse, duaVerse, dir, assetBase = "" }: ThanksCertificateProps) {
  const asset = (file: string) => `${assetBase}/minbar/assets/${file}`;

  return (
    <div
      className="cert-sheet cert-sheet-portrait"
      dir={dir}
      style={{ position: "relative", width: "100%", maxWidth: 760, margin: "0 auto", aspectRatio: "1/1.414", containerType: "inline-size", background: "#FFFEFB", boxShadow: "0 26px 70px rgba(16,33,43,.18)", overflow: "hidden", fontFamily: SANS, color: "#10212B" }}
    >
      <div aria-hidden="true" style={GROUND} />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative sheet artwork */}
      <img src={asset("aqsa-dome-line.png")} alt="" aria-hidden="true" style={{ position: "absolute", insetInline: "12%", bottom: "7%", width: "76%", height: "auto", opacity: 0.09, pointerEvents: "none" }} />

      <div aria-hidden="true" style={{ position: "absolute", inset: "2.4%", border: `2.5px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "3.4%", border: "1px solid rgba(211,154,39,.55)" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "4.4%", border: "1px dashed rgba(211,154,39,.5)" }} />
      <div aria-hidden="true" style={corner("top", "start")} />
      <div aria-hidden="true" style={corner("top", "end")} />
      <div aria-hidden="true" style={corner("bottom", "start")} />
      <div aria-hidden="true" style={corner("bottom", "end")} />

      <div style={{ position: "relative", height: "100%", padding: "8.5% 10% 7%", display: "grid", gridTemplateRows: "auto auto 1fr auto", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- letterhead */}
          <img src={asset("logo-horizontal.png")} alt={copy.orgName} style={{ width: "30%", maxWidth: 190, height: "auto" }} />
          <span dir="rtl" style={{ fontFamily: SERIF, fontSize: "clamp(11px,2cqw,15px)", color: "#10212B" }}>بسم الله الرحمن الرحيم</span>
          <p dir="rtl" style={{ margin: 0, width: "100%", fontFamily: SERIF, fontSize: "clamp(10px,2cqw,16px)", fontWeight: 700, lineHeight: 1.9, color: "#7C2318", whiteSpace: "nowrap" }}>{verse.arabic}</p>
          {verse.translation ? <p style={{ margin: 0, width: "94%", fontSize: "clamp(9px,1.4cqw,12px)", lineHeight: 1.7, color: "#7C2318", opacity: 0.85 }}>{verse.translation}</p> : null}
        </div>

        <div style={{ display: "grid", justifyItems: "center", gap: 16, paddingTop: "4%" }}>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: "clamp(38px,9.6cqw,78px)", fontWeight: 700, letterSpacing: ".04em", color: "#A93428", lineHeight: 1.7, whiteSpace: "nowrap" }}>{copy.title}</h1>
        </div>

        <div style={{ display: "grid", alignContent: "center", justifyItems: "center", gap: "3.4%" }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 10, width: "84%" }}>
            <span style={{ fontSize: "clamp(10px,1.9cqw,14px)", fontWeight: 700, color: "#52616B", whiteSpace: "nowrap" }}>{copy.nameLabel}</span>
            <span style={{ display: "grid", placeItems: "center", width: "100%", minHeight: 46, padding: "4px 6px", fontSize: "clamp(14px,3.4cqw,27px)", fontWeight: 800, color: "#10212B", whiteSpace: "nowrap" }}>{donorName}</span>
          </div>

          <p style={{ margin: 0, width: "94%", fontSize: "clamp(10px,2cqw,15px)", lineHeight: 2.1, color: "#132C38" }}>{copy.body}</p>

          <p dir="rtl" style={{ margin: "1.8% 0 0", width: "100%", fontFamily: SERIF, fontSize: "clamp(11px,2.4cqw,20px)", fontWeight: 700, lineHeight: 1.9, color: "#7C2318", whiteSpace: "nowrap" }}>{duaVerse.arabic}</p>
          {duaVerse.translation ? <p style={{ margin: 0, width: "92%", fontSize: "clamp(9px,1.4cqw,12px)", lineHeight: 1.7, color: "#7C2318", opacity: 0.85 }}>{duaVerse.translation}</p> : null}
          <p style={{ margin: 0, width: "92%", fontSize: "clamp(10px,2.15cqw,17px)", lineHeight: 2, color: "#132C38" }}>{copy.duaText}</p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingTop: "3%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the foundation's seal */}
          <img src={asset("cert-seal-alpha.png")} alt="" aria-hidden="true" style={{ width: "clamp(66px,12.5cqw,110px)", height: "auto" }} />
          <div style={{ display: "grid", justifyItems: "end", gap: 6, textAlign: "end" }}>
            <span style={{ fontFamily: SERIF, fontSize: "clamp(13px,2.7cqw,22px)", fontWeight: 700, color: "#B8811C", whiteSpace: "nowrap" }}>{copy.motto}</span>
            <span style={{ fontSize: "clamp(9px,1.6cqw,13px)", fontWeight: 700, color: "#132C38", whiteSpace: "nowrap" }}>{copy.orgName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
