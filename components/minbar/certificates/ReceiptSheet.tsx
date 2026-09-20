import type { CSSProperties } from "react";
import type { ReceiptCopy, ReceiptOrgData } from "@/lib/certificates/copy-defaults";

/**
 * The donation receipt — `handoff-certificates/إيصال التبرع.dc.html`.
 *
 * An accounting document, not a web card: registration header, the receipt
 * number in a dark box, bordered field rows, a numbered line table, the total,
 * a signature strip and a legal foot with the verification code. Every rule
 * is visible because the sheet is printed and filed. No slogans and no
 * emotional copy — the thank-you certificate is the place for those.
 *
 * Responsive to its own width (container query `rcp`), so it also works as
 * the scaled preview inside the success page.
 */

export interface ReceiptLine {
  title: string;
  /** Donation kind: project / zakat / waqf / recurring — each is accounted differently. */
  kind: string;
  /** Formatted amount in the receipt's one currency. */
  amount: string;
}

export interface ReceiptSheetProps {
  copy: ReceiptCopy;
  org: ReceiptOrgData;
  receiptNo: string;
  issueDate: string;
  payMethod: string;
  payStatus: string;
  donorName: string;
  donorContact: string;
  lines: ReceiptLine[];
  totalAmount: string;
  amountInWords?: string;
  verifyCode: string;
  /** "1 / 2" on the donor-language copy, "2 / 2" on the Turkish, "1 / 1" alone. */
  copyOf: string;
  /** Shown only on the donor-language copy of a bilingual receipt. */
  pairNote: string;
  dir: "rtl" | "ltr";
  assetBase?: string;
}

const C = {
  deep: "#10212B",
  gold: "#D39A27",
  red: "#A93428",
  green: "#1F7A4D",
  sand: "#F7F2EA",
  muted: "#52616B",
  line: "#C9C0B0",
  line2: "#E3DBCC",
};

const SANS = "var(--font-cairo), Cairo, system-ui, sans-serif";
const cell: CSSProperties = { padding: "9px 12px", borderInlineStart: `1px solid ${C.line2}` };
const micro: CSSProperties = { fontSize: 9.5, fontWeight: 800, color: C.muted };

export default function ReceiptSheet(props: ReceiptSheetProps) {
  const { copy, org, lines, dir, assetBase = "" } = props;
  const asset = (file: string) => `${assetBase}/minbar/assets/${file}`;

  return (
    <div
      className="rcp-sheet"
      dir={dir}
      style={{ position: "relative", width: "100%", maxWidth: 810, margin: "0 auto", background: "#FFFEFB", border: `1px solid ${C.line}`, boxShadow: "0 22px 58px rgba(16,33,43,.16)", containerType: "inline-size", containerName: "rcp", overflow: "hidden", fontFamily: SANS, color: C.deep, boxSizing: "border-box" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- watermark */}
      <img src={asset("aqsa-dome-line.png")} alt="" aria-hidden="true" style={{ position: "absolute", insetInlineEnd: "-2%", bottom: "12%", width: "38%", height: "auto", opacity: 0.045, pointerEvents: "none" }} />

      <div className="rcp-head" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "stretch", borderBottom: `2px solid ${C.deep}` }}>
        <div style={{ display: "grid", gap: 6, padding: "20px 22px 16px", minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- letterhead */}
          <img src={asset("logo-horizontal.png")} alt={copy.orgName} style={{ width: 176, maxWidth: "44cqw", height: "auto" }} />
          <span dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "right", fontSize: 11.5, fontWeight: 800, color: C.deep }}>{org.orgLegalName}</span>
          <span dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "right", fontSize: 10.5, lineHeight: 1.55, color: C.muted }}>{org.orgAddress}</span>
          <span style={{ fontSize: 10.5, color: C.muted }}>
            {copy.taxLabel}: <b dir="ltr" style={{ unicodeBidi: "isolate", fontWeight: 800 }}>{org.taxNo}</b> · <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{org.orgContact}</span>
          </span>
        </div>
        <div className="rcp-idbox" style={{ display: "grid", alignContent: "center", gap: 5, minWidth: 210, padding: "18px 22px", textAlign: "end", background: C.deep, color: "#fff" }}>
          <span style={{ fontSize: 15.5, fontWeight: 900, letterSpacing: "-.01em" }}>{copy.docTitle}</span>
          <span dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(255,255,255,.66)" }}>{copy.docTitleLatin}</span>
          <span style={{ height: 1, background: "rgba(211,154,39,.5)", margin: "5px 0" }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{copy.receiptNoLabel}</span>
          <b dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "left", fontSize: 19, fontWeight: 900, color: C.gold }}>{props.receiptNo}</b>
        </div>
      </div>

      <div className="rcp-band" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", borderBottom: `1px solid ${C.line}` }}>
        <div className="rcp-cell" style={{ ...cell, borderInlineStart: 0, display: "grid", gap: 3 }}>
          <span style={micro}>{copy.dateLabel}</span>
          <b dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "right", fontSize: 13.5, fontWeight: 800 }}>{props.issueDate}</b>
        </div>
        <div className="rcp-cell" style={{ ...cell, display: "grid", gap: 3 }}>
          <span style={micro}>{copy.methodLabel}</span>
          <b style={{ fontSize: 13.5, fontWeight: 800 }}>{props.payMethod}</b>
        </div>
        <div className="rcp-cell" style={{ ...cell, display: "grid", gap: 3 }}>
          <span style={micro}>{copy.statusLabel}</span>
          <span style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 900, color: C.green }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 7" /></svg>
            {props.payStatus}
          </span>
        </div>
      </div>

      <div className="rcp-band" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", borderBottom: `2px solid ${C.deep}` }}>
        <div className="rcp-cell" style={{ ...cell, borderInlineStart: 0, display: "grid", gap: 3, padding: 12 }}>
          <span style={micro}>{copy.donorLabel}</span>
          <b style={{ fontSize: "clamp(14px,2.1cqw,17px)", fontWeight: 900, overflowWrap: "anywhere" }}>{props.donorName}</b>
        </div>
        <div className="rcp-cell" style={{ ...cell, display: "grid", gap: 3, padding: 12 }}>
          <span style={micro}>{copy.donorRefLabel}</span>
          <b dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "right", fontSize: 13, fontWeight: 800, color: C.muted, overflowWrap: "anywhere" }}>{props.donorContact}</b>
        </div>
      </div>

      {lines.length ? (
        <>
          <div className="rcp-thead" style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 116px 132px", padding: 0, background: C.sand, borderBottom: `1px solid ${C.line}` }}>
            <span className="rcp-cell" style={{ ...cell, borderInlineStart: 0, padding: "8px 6px", textAlign: "center", fontSize: 9.5, fontWeight: 900, color: C.muted }}>#</span>
            <span className="rcp-cell" style={{ ...cell, padding: "8px 12px", fontSize: 9.5, fontWeight: 900, color: C.muted }}>{copy.colItem}</span>
            <span className="rcp-cell rcp-kind" style={{ ...cell, padding: "8px 12px", fontSize: 9.5, fontWeight: 900, color: C.muted }}>{copy.colType}</span>
            <span className="rcp-cell" style={{ ...cell, padding: "8px 12px", textAlign: "end", fontSize: 9.5, fontWeight: 900, color: C.muted }}>{copy.colAmount}</span>
          </div>
          {lines.map((ln, i) => (
            <div key={i} className="rcp-trow" style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 116px 132px", borderBottom: `1px solid ${C.line2}`, background: i % 2 === 0 ? "rgba(247,242,234,.5)" : "transparent" }}>
              <span className="rcp-cell" style={{ ...cell, borderInlineStart: 0, padding: "11px 6px", textAlign: "center", fontSize: 11.5, fontWeight: 800, color: C.muted }}>{i + 1}</span>
              <span className="rcp-cell" style={{ ...cell, padding: "11px 12px", fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{ln.title}</span>
              <span className="rcp-cell rcp-kind" style={{ ...cell, padding: "11px 12px", fontSize: 11.5, fontWeight: 800, color: C.muted }}>{ln.kind}</span>
              <b className="rcp-cell" dir="ltr" style={{ ...cell, unicodeBidi: "isolate", padding: "11px 12px", textAlign: "end", fontSize: 13.5, fontWeight: 900, whiteSpace: "nowrap" }}>{ln.amount}</b>
            </div>
          ))}
        </>
      ) : (
        <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "30px 22px", borderBottom: `1px solid ${C.line}`, background: "rgba(247,242,234,.5)", textAlign: "center" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.muted }}>{copy.emptyTitle}</span>
          <span style={{ maxWidth: "100%", fontSize: 11, color: C.muted, textWrap: "pretty" }}>{copy.emptyHint}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 14, padding: "14px 22px", borderBottom: `1px solid ${C.line}`, background: "rgba(211,154,39,.07)" }}>
        <div style={{ display: "grid", gap: 3 }}>
          <b style={{ fontSize: 14.5, fontWeight: 900 }}>{copy.totalLabel}</b>
          {props.amountInWords ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>
              {copy.wordsLabel} {props.amountInWords}
            </span>
          ) : null}
        </div>
        <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: "clamp(21px,3.3cqw,29px)", fontWeight: 900, color: C.red, whiteSpace: "nowrap" }}>{props.totalAmount}</b>
      </div>

      <div className="rcp-sign" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "end", gap: 20, padding: "22px 22px 22px" }}>
        <div style={{ display: "grid", gridTemplateRows: "auto auto auto", gap: 7, justifyItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the official stamp and signature */}
          <img src={asset("waqf-director-stamp.png")} alt="" aria-hidden="true" style={{ display: "block", width: 168, maxWidth: "66%", height: "auto", marginBottom: -14, pointerEvents: "none" }} />
          <span style={{ width: "86%", borderBottom: `1px solid ${C.line}` }} />
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>{copy.signatureLabel}</span>
        </div>
        <div style={{ display: "grid", gridTemplateRows: "auto auto auto", gap: 7, justifyItems: "center", alignContent: "end" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{copy.accountantLabel}</span>
          <span style={{ width: "86%", borderBottom: `1px solid ${C.line}` }} />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.muted }}>{copy.orgName}</span>
        </div>
      </div>

      <div className="rcp-foot" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 14, padding: "13px 22px", borderTop: `1px solid ${C.line}`, background: C.sand }}>
        <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.85, color: C.muted }}>{copy.legalNote}</p>
        <span style={{ justifySelf: "end", display: "grid", gap: 2, textAlign: "end", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>{copy.verifyLabel}</span>
          <b dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: C.deep }}>{props.verifyCode}</b>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, padding: "9px 22px", borderTop: `1px solid ${C.line2}` }}>
        <span dir="ltr" style={{ unicodeBidi: "isolate", textAlign: "right", fontSize: 9.5, fontWeight: 700, color: C.muted }}>{props.pairNote}</span>
        <span dir="ltr" style={{ unicodeBidi: "isolate", fontSize: 9.5, fontWeight: 800, color: C.muted, whiteSpace: "nowrap" }}>{props.copyOf}</span>
      </div>
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(to left, ${C.gold}, ${C.red})` }} />
    </div>
  );
}

/** The template's container-query rules, shared by the print page and the PDF. */
export const RECEIPT_RESPONSIVE_CSS = `
@container rcp (max-width: 640px) {
  .rcp-head { grid-template-columns: minmax(0,1fr) !important; }
  .rcp-head > .rcp-idbox { min-width: 0 !important; text-align: start !important; }
  .rcp-band { grid-template-columns: minmax(0,1fr) !important; }
  .rcp-band > * { border-inline-start: 0 !important; border-top: 1px solid #E3DBCC; }
  .rcp-band > *:first-child { border-top: 0 !important; }
  .rcp-sign { grid-template-columns: minmax(0,1fr) !important; gap: 34px !important; }
  .rcp-foot { grid-template-columns: minmax(0,1fr) !important; }
  .rcp-thead, .rcp-trow { grid-template-columns: 28px minmax(0,1fr) 92px !important; }
  .rcp-kind { display: none !important; }
}`;
