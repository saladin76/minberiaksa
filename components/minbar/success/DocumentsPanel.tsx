"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SuccessDocuments } from "@/lib/certificates/documents";
import ThanksCertificate from "@/components/minbar/certificates/ThanksCertificate";
import WaqfCertificateSheet from "@/components/minbar/certificates/WaqfCertificateSheet";
import { withDonationToken } from "@/lib/donations/access-token-link";
import ReceiptSheet from "@/components/minbar/certificates/ReceiptSheet";
import ScaledSheet from "@/components/minbar/certificates/ScaledSheet";

/**
 * The download surface of the success page — `نجاح التبرع.dc.html`
 * (`#succ-downloads` and the three preview panels).
 *
 * Receipt and thank-you certificate are always offered; a waqf certificate
 * button appears once per waqf line the order held, each with its own number
 * and its own panel. Every preview is the live sheet component scaled down,
 * never an image, and every download is the server's PDF of the persisted
 * record — the placeholders in the handoff (`receiptHref`, `certificateHref`,
 * `waqfCertHref`) are the real endpoints here.
 *
 * The donor may correct the name on the thank-you certificate and on each
 * waqf certificate; the preview follows as they type, and the final name is
 * what the PDF endpoint receives (`?name=`) and stores.
 */

const DownloadIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
  </svg>
);

const rowButton = (tone: "plain" | "gold" | "red"): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  height: 46,
  padding: "0 20px",
  borderRadius: 8,
  border: tone === "gold" ? "1px solid rgba(211,154,39,.55)" : tone === "red" ? "1px solid rgba(169,52,40,.5)" : "1px solid var(--border)",
  background: tone === "gold" ? "rgba(211,154,39,.1)" : tone === "red" ? "rgba(169,52,40,.08)" : "#fff",
  fontFamily: "inherit",
  fontWeight: 800,
  fontSize: 14,
  color: "var(--deep)",
  cursor: "pointer",
});

const panel: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 16,
  padding: 22,
  background: "#fff",
  border: "1px solid var(--border)",
  borderRadius: 14,
  textAlign: "start",
};

const downloadLink = (background: string, color: string): React.CSSProperties => ({
  justifySelf: "center",
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  height: 46,
  padding: "0 24px",
  borderRadius: 8,
  background,
  color,
  fontWeight: 900,
  fontSize: 14,
  textDecoration: "none",
});

const input: React.CSSProperties = {
  height: 46,
  padding: "0 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "#fff",
  fontFamily: "inherit",
  fontSize: 14,
  color: "var(--deep)",
};

export default function DocumentsPanel({
  documents,
  donationId,
  accessToken,
  donorName,
  extraButtons,
}: {
  documents: SuccessDocuments | null;
  donationId: string;
  /** The guest's `?t=`; every document link carries it. Null for a signed-in owner. */
  accessToken: string | null;
  /** From checkout — pre-fills the certificate name. */
  donorName: string;
  /** The share button, rendered in the same row. */
  extraButtons?: ReactNode;
}) {
  const t = useTranslations("system");
  const tCart = useTranslations("cart");
  const tCert = useTranslations("certificates");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [certName, setCertName] = useState(documents?.thanks.donorName || donorName);
  const [waqfOpen, setWaqfOpen] = useState<Record<string, boolean>>({});
  const [waqfNames, setWaqfNames] = useState<Record<string, string>>({});

  const waqf = documents?.waqf ?? [];
  const waqfKey = (index: number) => waqf[index].certificateId || String(index);
  const waqfName = (index: number) => waqfNames[waqfKey(index)] ?? waqf[index].donorName;

  const receiptHref = withDonationToken(`/api/receipts/${donationId}`, accessToken);
  const certificateHref = withDonationToken(
    `/api/certificates/thanks/${donationId}${certName.trim() ? `?name=${encodeURIComponent(certName.trim())}` : ""}`,
    accessToken
  );
  const waqfHref = (index: number) => {
    const doc = waqf[index];
    if (!doc.certificateId) return null;
    const name = waqfName(index).trim();
    return withDonationToken(`/api/certificates/waqf/${doc.certificateId}${name ? `?name=${encodeURIComponent(name)}` : ""}`, accessToken);
  };

  return (
    <>
      <div id="succ-downloads" className="succ-in succ-in-4" style={{ width: "100%", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" onClick={() => setReceiptOpen((open) => !open)} aria-expanded={receiptOpen} className="succ-link" style={rowButton("plain")}>
          {DownloadIcon}
          {t("downloadReceipt")}
        </button>

        <button type="button" onClick={() => setCertOpen((open) => !open)} aria-expanded={certOpen} className="succ-link2" style={rowButton("gold")}>
          {DownloadIcon}
          {t("thankYouCertTitle")}
        </button>

        {waqf.map((doc, index) => {
          const key = waqfKey(index);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setWaqfOpen((state) => ({ ...state, [key]: !state[key] }))}
              aria-expanded={Boolean(waqfOpen[key])}
              className="succ-link2 succ-link-waqf"
              style={rowButton("red")}
            >
              {DownloadIcon}
              {doc.unit === "meter" ? tCart("meterCertName") : tCart("shareCertName")}
            </button>
          );
        })}

        {extraButtons}
      </div>

      {receiptOpen ? (
        <div style={panel}>
          {documents?.receipt ? (
            <ScaledSheet width={810} height={null} maxWidth={520} className="succ-receipt-canvas">
              <div style={{ width: 810 }}>
                <ReceiptSheet
                  copy={documents.receipt.copy}
                  org={documents.receipt.org}
                  receiptNo={documents.receipt.receiptNo}
                  issueDate={documents.receipt.issueDate}
                  payMethod={documents.receipt.payMethod}
                  payStatus={documents.receipt.payStatus}
                  donorName={documents.receipt.donorName}
                  donorContact={documents.receipt.donorContact}
                  lines={documents.receipt.lines}
                  totalAmount={documents.receipt.totalAmount}
                  verifyCode={documents.receipt.verifyCode}
                  copyOf={documents.receipt.copyOf}
                  pairNote={documents.receipt.pairNote}
                  dir={documents.receipt.dir}
                />
              </div>
            </ScaledSheet>
          ) : (
            <p style={{ margin: 0, textAlign: "center", fontSize: 13.5, color: "var(--muted)" }}>{t("issuing")}</p>
          )}
          <a href={receiptHref} style={downloadLink("var(--deep)", "#fff")}>
            {DownloadIcon}
            {t("downloadReceipt")}
          </a>
        </div>
      ) : null}

      {certOpen && documents ? (
        <div style={panel}>
          <label style={{ display: "grid", gap: 7 }}>
            <b style={{ fontSize: 13, fontWeight: 800 }}>{t("certNameLabel")}</b>
            <input value={certName} onChange={(event) => setCertName(event.target.value)} placeholder={t("writeYourName")} style={input} />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", gap: 20 }}>
            <ScaledSheet width={1060} height={750} maxWidth={620} className="succ-cert-canvas">
              <div style={{ width: 1060 }}>
                <ThanksCertificate donorName={certName.trim()} copy={documents.thanks.copy} verse={documents.thanks.verse} duaVerse={documents.thanks.duaVerse} dir={documents.thanks.dir} />
              </div>
            </ScaledSheet>
          </div>
          <a href={certificateHref} style={downloadLink("var(--gold)", "#10212B")}>
            {DownloadIcon}
            {t("downloadThankYouCert")}
          </a>
        </div>
      ) : null}

      {waqf.map((doc, index) => {
        const key = waqfKey(index);
        if (!waqfOpen[key]) return null;
        const href = waqfHref(index);
        const name = waqfName(index);
        return (
          <div key={key} style={panel}>
            <label style={{ display: "grid", gap: 7 }}>
              <b style={{ fontSize: 13, fontWeight: 800 }}>{t("waqfNameLabel")}</b>
              <input value={name} onChange={(event) => setWaqfNames((state) => ({ ...state, [key]: event.target.value }))} placeholder={t("writeYourName")} style={input} />
            </label>
            {/* The face alone, as the handoff previews it; the presentation panel is on the PDF. */}
            <ScaledSheet width={1200} height={null} maxWidth={420} className="succ-waqf-canvas">
              <div style={{ width: 1200 }}>
                <WaqfCertificateSheet
                  unit={doc.unit}
                  count={doc.count}
                  total={doc.total}
                  donorName={name.trim()}
                  onBehalf={doc.onBehalf}
                  certNo={doc.certNo || "—"}
                  certDate={doc.certDate || "—"}
                  copy={doc.copy}
                  locale={doc.locale}
                  dir={doc.dir}
                  faceOnly
                />
              </div>
            </ScaledSheet>
            {href ? (
              <a href={href} style={downloadLink("#A93428", "#fff")}>
                {DownloadIcon}
                {doc.unit === "meter" ? tCart("downloadMeterCert") : tCart("downloadShareCert")}
              </a>
            ) : (
              <p style={{ margin: 0, textAlign: "center", fontSize: 13.5, color: "var(--muted)" }}>
                {t("issuing")} — {tCert("certNoLabel")}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
