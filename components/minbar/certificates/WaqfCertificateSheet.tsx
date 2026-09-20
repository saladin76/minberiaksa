import type { CSSProperties } from "react";
import type { WaqfCopy } from "@/lib/certificates/copy-defaults";

/**
 * The official waqf certificate — `handoff-certificates/شهادة الاوقاف.dc.html`.
 *
 * One A4 landscape sheet, two panels side by side: the certificate on its
 * official gold frame (the frame, tughra, title logotype, seal and director's
 * stamp are the foundation's own artwork, not approximations), and the
 * foundation's presentation on the other. The pair stays `ltr` so the panels
 * keep their printed order; each panel reads in the edition's direction.
 *
 * Arabic editions carry the engraved Arabic title; every other language sets
 * the title as text with the same hierarchy as the official English print
 * ("Certificate" eyebrow, then the unit). The English and Turkish wording is
 * the association's printed certificates verbatim (i18n `certificates`).
 *
 * Like the thank-you sheet this takes no hooks: strings come from the caller
 * so the same markup serves the site, the print page and the PDF.
 */

export interface WaqfCertificateSheetProps {
  unit: "share" | "meter";
  count: number;
  /** Formatted total, e.g. "$1,500". */
  total: string;
  donorName: string;
  onBehalf: string;
  /** The issued number — or a marked preview value before payment. */
  certNo: string;
  certDate: string;
  copy: WaqfCopy;
  /** `ar` shows the engraved Arabic title artwork. */
  locale: string;
  dir: "rtl" | "ltr";
  /** Hide the presentation panel (the success-page preview shows the face only). */
  faceOnly?: boolean;
  assetBase?: string;
}

const SANS = "var(--font-cairo), Cairo, sans-serif";
const SERIF = "var(--font-amiri), Amiri, serif";
const LATIN_SERIF = "Georgia, 'Times New Roman', serif";
const INK = "#10212B";
const RULE = "#b9b0a0";

const label: CSSProperties = { fontFamily: SANS, fontSize: "clamp(8px,1.5cqw,13px)", fontWeight: 700, color: INK, whiteSpace: "nowrap" };
const box = (size: string): CSSProperties => ({
  minWidth: "13cqw",
  minHeight: "4.2cqw",
  padding: "0 6px",
  border: "1px solid #b08b3f",
  display: "grid",
  placeItems: "center",
  fontFamily: SANS,
  fontWeight: 800,
  fontSize: size,
  color: INK,
});
const line: CSSProperties = { fontFamily: SANS, fontSize: "clamp(8px,1.65cqw,14px)", fontWeight: 700, color: INK };
const foot: CSSProperties = { fontFamily: SANS, fontSize: "clamp(8px,1.55cqw,13px)", fontWeight: 700, color: INK };

export default function WaqfCertificateSheet({
  unit,
  count,
  total,
  donorName,
  onBehalf,
  certNo,
  certDate,
  copy,
  locale,
  dir,
  faceOnly = false,
  assetBase = "",
}: WaqfCertificateSheetProps) {
  const asset = (file: string) => `${assetBase}/minbar/assets/${file}`;
  const isShare = unit === "share";
  const showArabicTitle = locale === "ar";
  const endowedLine = isShare ? copy.endowedShares : copy.endowedMeters;
  const countLabel = isShare ? copy.countShares : copy.countMeters;
  /* "سهم وقفي" is teal, "متر وقفي" maroon — the official identities of the two
     printed certificates, never unified. */
  const titleColor = isShare ? "rgb(0,96,96)" : "rgb(176,64,48)";

  return (
    <div
      className="waqf-pair"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: faceOnly ? "minmax(0,1fr)" : "1fr 1fr",
        alignItems: "center",
        gap: "3%",
        width: "100%",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "1.6%",
        boxSizing: "border-box",
        background: "#fff",
        direction: "ltr",
      }}
    >
      <div
        className="waqf-sheet"
        dir={dir}
        style={{
          position: "relative",
          width: "100%",
          gridColumn: 1,
          aspectRatio: "845/1178",
          height: "auto",
          containerType: "inline-size",
          boxSizing: "border-box",
          background: `#fff url('${asset("waqf-cert-frame-blank.png")}') center/100% 100% no-repeat`,
        }}
      >
        <div style={{ position: "absolute", inset: "7.13% 9.11%", display: "grid", gridTemplateRows: "auto auto auto 1fr auto", padding: "3.4% 4.6% 2.4%", boxSizing: "border-box", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <span style={{ display: "grid", gap: 4, justifyItems: "center" }}>
              <span style={label}>{copy.certNoLabel}</span>
              <span style={box("clamp(9px,1.6cqw,14px)")}>{certNo}</span>
            </span>
            <span style={{ display: "grid", gap: 4, justifyItems: "center" }}>
              <span style={label}>{countLabel}</span>
              <span style={box("clamp(9px,1.7cqw,15px)")}>{count}</span>
            </span>
          </div>

          <div style={{ display: "grid", justifyItems: "center", marginTop: "-6.5cqw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- official artwork sized in container units */}
            <img src={asset("waqf-tughra-official.png")} alt="بسم الله الرحمن الرحيم" style={{ width: "24cqw", maxWidth: 200, height: "auto" }} />
          </div>

          <div style={{ display: "grid", justifyItems: "center", gap: "1.2cqw", paddingTop: "2.4cqw" }}>
            {showArabicTitle ? (
              // eslint-disable-next-line @next/next/no-img-element -- the engraved Arabic logotype
              <img
                src={asset(isShare ? "cert-title-share-tight.png" : "cert-title-meter-tight.png")}
                alt={isShare ? copy.certTitleShare : copy.certTitleMeter}
                style={{ display: "block", width: "auto", height: "13.4cqw", maxHeight: 108, objectFit: "contain" }}
              />
            ) : (
              <span style={{ display: "grid", justifyItems: "center", gap: ".3cqw" }}>
                <span style={{ fontFamily: LATIN_SERIF, fontStyle: "italic", fontWeight: 700, fontSize: "clamp(9px,1.7cqw,15px)", color: "#A0522D" }}>{copy.certWord}</span>
                <span style={{ fontFamily: LATIN_SERIF, fontWeight: 700, fontSize: "clamp(15px,3.2cqw,27px)", lineHeight: 1.15, color: titleColor }}>
                  {isShare ? copy.shareUnitTitle : copy.meterUnitTitle}
                </span>
              </span>
            )}
            <p style={{ margin: "2.6cqw 0 0", fontFamily: SANS, fontSize: "clamp(10px,2.05cqw,18px)", fontWeight: 800, color: INK, whiteSpace: "nowrap" }}>{copy.certifiesThat}</p>
          </div>

          <div style={{ display: "grid", alignContent: "start", gap: "3cqw", paddingTop: "3.2cqw", textAlign: "start" }}>
            <span style={{ display: "block", width: "100%", borderBottom: `1px solid ${RULE}`, minHeight: "3.4cqw", fontFamily: SANS, fontSize: "clamp(10px,2cqw,18px)", fontWeight: 800, color: INK, textAlign: "center" }}>
              {donorName}
            </span>

            <div style={{ ...line, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "2cqw" }}>
              <span style={{ whiteSpace: "nowrap" }}>
                {endowedLine} (<b>{count}</b>)
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4, flex: 1 }}>
                <span style={{ whiteSpace: "nowrap" }}>{copy.valueLabel}</span>
                <b dir="ltr" style={{ unicodeBidi: "isolate", flex: 1, borderBottom: `1px solid ${RULE}`, textAlign: "center" }}>{total}</b>
              </span>
            </div>

            <div style={{ ...line, display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ whiteSpace: "nowrap" }}>{copy.onBehalfLabel}</span>
              <span style={{ flex: 1, borderBottom: `1px solid ${RULE}`, textAlign: "center", fontWeight: 800 }}>{onBehalf}</span>
            </div>

            {/* The waqf's legal wording — reviewed content, never paraphrased. */}
            <p style={{ margin: "1.6cqw 0 0", fontFamily: SERIF, fontSize: "clamp(8px,1.72cqw,15px)", fontWeight: 400, lineHeight: 2.3, color: "#1a1a1a", textAlign: "center" }}>{copy.legalText}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: "2cqw" }}>
            <div style={{ display: "grid", gap: "1.4cqw", justifyItems: "center" }}>
              <span style={foot}>{certDate}</span>
              <span style={{ width: "80%", borderBottom: `1px solid ${RULE}` }} />
              <span style={foot}>{copy.dateLabel}</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- the foundation's seal */}
            <img src={asset("waqf-cert-seal-full.png")} alt="" aria-hidden="true" style={{ width: "17cqw", maxWidth: 150, height: "auto", justifySelf: "center" }} />
            <div style={{ position: "relative", display: "grid", gap: "1.4cqw", justifyItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- director's stamp and signature */}
              <img src={asset("waqf-director-stamp.png")} alt="" aria-hidden="true" style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", width: "30cqw", maxWidth: 210, height: "auto", marginBottom: "-1.6cqw", pointerEvents: "none" }} />
              <span style={foot}>{copy.directorLabel}</span>
              <span style={{ width: "80%", borderBottom: `1px solid ${RULE}` }} />
            </div>
          </div>
        </div>
      </div>

      {faceOnly ? null : (
        <div
          className="waqf-back"
          dir={dir}
          style={{ position: "relative", width: "100%", gridColumn: 2, aspectRatio: "845/1178", containerType: "inline-size", boxSizing: "border-box", display: "grid", alignContent: "center", justifyItems: "center", gap: "5.4cqw", padding: "5% 7%", textAlign: "center" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the foundation's full logotype */}
          <img src={asset("waqf-logo-full-hq.png")} alt="مؤسسة منبر الأقصى الدولية — Minber-i Aksâ Derneği" style={{ display: "block", width: "66cqw", maxWidth: 440, height: "auto", marginBottom: "1cqw" }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative rule */}
          <img src={asset("waqf-divider-rule-hq.png")} alt="" aria-hidden="true" style={{ display: "block", width: "80cqw", maxWidth: 480, height: "auto" }} />
          <p style={{ margin: 0, width: "92%", fontFamily: SANS, fontSize: "clamp(10px,2.9cqw,20px)", fontWeight: 700, lineHeight: 2.05, color: INK }}>{copy.aboutText}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative rule, mirrored */}
          <img src={asset("waqf-divider-rule-hq.png")} alt="" aria-hidden="true" style={{ display: "block", width: "80cqw", maxWidth: 480, height: "auto", transform: "scaleY(-1)" }} />
        </div>
      )}
    </div>
  );
}
