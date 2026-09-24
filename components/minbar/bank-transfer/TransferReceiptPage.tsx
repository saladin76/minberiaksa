"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { withDonationToken } from "@/lib/donations/access-token-link";
import { formatMoney } from "@/lib/minbar/money";
import { formatIban, type MinbarBank } from "@/lib/minbar/banks";
import type { DonorClaimView } from "@/lib/donations/bank-transfer-serializers";
import { MAX_RECEIPT_BYTES, RECEIPT_ACCEPT_ATTR, formatBytes, inferReceiptMime, validateReceiptFile } from "@/lib/uploads/receipt-file-rules";
import { Button } from "@/components/minbar/ds";
import { FailIcon, PendingIcon, SuccessIcon } from "@/components/minbar/states/StatusIcons";

/**
 * The donor's side of a bank transfer — `DONATION_LOGIC_SPEC §3`:
 *
 *   Awaiting receipt → Receipt uploaded → Under review → Confirmed | Rejected
 *
 * One page for the whole life of the transfer, so the link in every email
 * lands on the same address and always shows the current truth. Four states:
 *
 *  - awaiting: the account to transfer to, then the upload form;
 *  - under review: what was sent, what happens next;
 *  - rejected: the finance team's reason, then the form again while attempts
 *    remain — or, once they are used up, the way to reach a human;
 *  - confirmed: the receipt and the donation page.
 *
 * Nothing here is trusted for money: the server re-checks the file, the
 * attempt count and who may act on the claim.
 */

export interface TransferReceiptPageProps {
  claim: DonorClaimView;
  /** The published account the donor picked at checkout, when still published. */
  bank: MinbarBank | null;
  /** Guest access token from the URL; a signed-in owner has none. */
  token: string | null;
  donorName: string | null;
}

type UploadError = "type" | "size" | "empty" | "network" | "closed" | "forbidden" | "attempts" | null;

const SECTION = { maxWidth: 1240, margin: "0 auto", padding: "0 24px" } as const;

export default function TransferReceiptPage({ claim: initial, bank, token, donorName }: TransferReceiptPageProps) {
  const locale = useLocale();
  const t = useTranslations("transferReceipt");
  const tCart = useTranslations("cart");
  const tSystem = useTranslations("system");
  const [claim, setClaim] = useState<DonorClaimView>(initial);

  const query = token ? `?t=${encodeURIComponent(token)}` : "";
  const dateFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" });
  const money = (amount: number, currency: string) => {
    try {
      return formatMoney(amount, currency, locale);
    } catch {
      return `${amount} ${currency}`;
    }
  };

  /* A returning tab picks up a decision made while it was in the background. */
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/bank-transfer/${claim.donationId}${query}${query ? "&" : "?"}locale=${locale}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { claim?: DonorClaimView };
        if (data.claim) setClaim(data.claim);
      } catch {
        /* Stale is fine; the next visibility change tries again. */
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [claim.donationId, query, locale]);

  const exhausted = claim.status === "REJECTED" && !claim.canUpload;
  const state: "awaiting" | "review" | "rejected" | "exhausted" | "confirmed" =
    claim.status === "CONFIRMED" ? "confirmed"
    : claim.status === "UNDER_REVIEW" ? "review"
    : exhausted ? "exhausted"
    : claim.status === "REJECTED" ? "rejected"
    : "awaiting";

  const tone = state === "confirmed" ? TONES.success : state === "rejected" || state === "exhausted" ? TONES.error : TONES.pending;
  const glyph = state === "confirmed" ? SuccessIcon : state === "rejected" || state === "exhausted" ? FailIcon : PendingIcon;
  const title = t(`${state}Title` as "awaitingTitle");
  const lead = t(`${state}Lead` as "awaitingLead");

  /* Which of the four stages is lit. Rejected sits at the upload stage: the
     donor is being asked to do that step again. */
  const stage = state === "confirmed" ? 4 : state === "review" ? 3 : 2;
  const steps = [t("stepTransfer"), t("stepUpload"), t("stepReview"), t("stepConfirmed")];

  const ibanForChosenCurrency = bank?.currencies.find((c) => c.code === claim.bankCurrency) ?? bank?.currencies[0] ?? null;

  return (
    <div style={{ position: "relative" }}>
      <section style={{ padding: "44px 0 18px" }}>
        <div id="pay-steps" style={{ ...SECTION, display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", minWidth: 0 }}>
          {steps.map((label, i) => {
            const n = i + 1;
            const done = n < stage || state === "confirmed";
            const current = n === stage && state !== "confirmed";
            const failed = current && (state === "rejected" || state === "exhausted");
            return (
              <span key={label} style={{ display: "contents" }}>
                <span
                  aria-current={current ? "step" : undefined}
                  style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 14px", borderRadius: 999, border: `1px solid ${current ? (failed ? "var(--red)" : "var(--gold)") : done ? "rgba(31,122,77,.35)" : "var(--border)"}`, background: current || done ? "#fff" : "transparent", color: current || done ? "var(--deep)" : "var(--muted)", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" }}
                >
                  <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", background: done ? "var(--green)" : current ? (failed ? "var(--red)" : "var(--gold)") : "var(--border)", color: done || failed ? "#fff" : current ? "#10212B" : "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                    {done ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                      n
                    )}
                  </span>
                  {label}
                </span>
                {i < steps.length - 1 ? <span aria-hidden="true" style={{ flex: "1 1 24px", maxWidth: 60, height: 1, background: done ? "rgba(31,122,77,.35)" : "var(--border)" }} /> : null}
              </span>
            );
          })}
        </div>
      </section>

      <section style={{ padding: "8px 0 24px" }}>
        <div style={{ ...SECTION, display: "grid", justifyItems: "center", gap: 14, textAlign: "center" }}>
          <span className={state === "review" ? "mia-status-glyph mia-status-glyph--animate" : "mia-status-glyph"} style={{ display: "grid", placeItems: "center", width: 74, height: 74, borderRadius: "50%", background: tone.background, color: tone.color }}>
            {glyph}
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(24px,2.8vw,32px)", fontWeight: 900 }}>{title}</h1>
          <p style={{ margin: 0, maxWidth: "56ch", color: "var(--muted)", fontSize: 16, lineHeight: 1.9 }}>{lead}</p>
        </div>
      </section>

      <section style={{ padding: "0 0 64px" }}>
        <div id="pay-grid" style={{ ...SECTION, display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,.85fr)", gap: 40, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 22 }}>
            {state === "rejected" || state === "exhausted" ? (
              <div role="alert" className="pay-card" style={{ ...cardBox, borderColor: "rgba(169,52,40,.35)", background: "rgba(169,52,40,.05)" }}>
                <b style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--red)" }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 11v5" /></svg>
                  {t("rejectionReason")}
                </b>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8 }}>{claim.rejectionReason || "—"}</p>
                {claim.reviewedAt ? <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("reviewedOn")}: {dateFormat.format(new Date(claim.reviewedAt))}</span> : null}
              </div>
            ) : null}

            {state === "awaiting" && bank ? (
              <div className="pay-card" style={cardBox}>
                <h2 style={headingStyle}>
                  <span aria-hidden="true" style={headingIcon}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M12 3 21 8H3Z" /></svg>
                  </span>
                  {tCart("bankHeading")}
                </h2>
                <BankDetails bank={bank} highlightCurrency={ibanForChosenCurrency?.code ?? null} copyLabel={tCart("accountName")} accountNameLabel={tCart("accountName")} />
              </div>
            ) : null}

            {state === "awaiting" || state === "rejected" ? (
              <UploadForm
                claim={claim}
                query={query}
                locale={locale}
                donorName={donorName}
                onSubmitted={setClaim}
                labels={{
                  heading: state === "rejected" ? t("resubmit") : t("uploadHeading"),
                  hint: t("uploadHint", { max: formatBytes(MAX_RECEIPT_BYTES) }),
                  attemptsLeft: t("attemptsLeft", { count: claim.maxSubmissions - claim.submissionCount }),
                }}
                t={t}
              />
            ) : null}

            {state === "exhausted" ? (
              <div className="pay-card" style={cardBox}>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.9, color: "var(--muted)" }}>{t("exhaustedLead")}</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Button variant="primary" href={miaPath("contact", locale)} style={{ whiteSpace: "nowrap" }}>{t("contactUs")}</Button>
                  <Button variant="light" href={miaPath("home", locale)} style={{ whiteSpace: "nowrap" }}>{t("backHome")}</Button>
                </div>
              </div>
            ) : null}

            {state === "review" ? (
              <div className="pay-card" style={cardBox}>
                <h2 style={headingStyle}>
                  <span aria-hidden="true" style={headingIcon}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  </span>
                  {t("whatNext")}
                </h2>
                <NextSteps items={[t("nextReview"), t("nextEmail"), t("nextReceipt")]} />
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Button variant="light" href={miaPath("account", locale)} style={{ whiteSpace: "nowrap" }}>{t("goToAccount")}</Button>
                  <Button variant="ghost" href={miaPath("home", locale)} style={{ whiteSpace: "nowrap" }}>{t("backHome")}</Button>
                </div>
              </div>
            ) : null}

            {state === "confirmed" ? (
              <div className="pay-card" style={cardBox}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Button variant="primary" href={withDonationToken(`/api/donations/${claim.donationId}/receipt?locale=${encodeURIComponent(locale)}`, claim.donationAccessToken)} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: "nowrap" }}>
                    {t("downloadReceipt")}
                  </Button>
                  <Button variant="light" href={withDonationToken(`${miaPath("donationSuccess", locale)}/${claim.donationId}`, claim.donationAccessToken)} style={{ whiteSpace: "nowrap" }}>{t("viewDonation")}</Button>
                  <Button variant="ghost" href={miaPath("account", locale)} style={{ whiteSpace: "nowrap" }}>{t("goToAccount")}</Button>
                </div>
              </div>
            ) : null}

            {claim.receipts.length > 0 ? (
              <div className="pay-card" style={cardBox}>
                <b style={{ fontSize: 14 }}>{t("submittedFiles")}</b>
                <div style={{ display: "grid", gap: 8 }}>
                  {[...claim.receipts].reverse().map((file) => (
                    <a key={`${file.submission}-${file.uploadedAt}`} href={file.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--ivory)", color: "inherit", textDecoration: "none" }}>
                      <FileThumb url={file.url} isImage={file.isImage} name={file.fileName} />
                      <span style={{ display: "grid", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
                        <b dir="ltr" style={{ fontSize: 13.5, unicodeBidi: "isolate", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" }}>{file.fileName}</b>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {t("submission", { n: file.submission })} · {formatBytes(file.bytes)} · {dateFormat.format(new Date(file.uploadedAt))}
                        </span>
                      </span>
                      <span style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 800, color: "var(--gold)" }}>{t("viewFile")}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Summary ─────────────────────────────────────────────────── */}
          <aside id="pay-summary" className="pay-card" style={{ display: "grid", gap: 14, padding: 26, background: "var(--sand)", border: "1px solid rgba(211,154,39,.35)", borderRadius: 14, position: "sticky", top: 92 }}>
            <h2 style={{ ...headingStyle, fontSize: 18 }}>
              <span aria-hidden="true" style={{ ...headingIcon, width: 30, height: 30, background: "#fff" }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m4 8 2 11h12l2-11H4Z" /><path d="m9 8 3-4 3 4M9 12v3M15 12v3" /></svg>
              </span>
              {t("yourDonation")}
            </h2>

            <div style={{ display: "grid", gap: 10, paddingBottom: 14, borderBottom: "1px solid rgba(211,154,39,.3)" }}>
              {claim.lines.map((line, i) => (
                <span key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
                  <span style={{ color: "var(--muted)", minWidth: 0 }}>{line.title}</span>
                  <b dir="ltr" style={{ flex: "0 0 auto", unicodeBidi: "isolate" }}>{money(line.amount, claim.currency)}</b>
                </span>
              ))}
            </div>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 16, fontWeight: 900 }}>
              {t("amount")}
              <b dir="ltr" style={{ fontSize: 22, unicodeBidi: "isolate" }}>{money(claim.amount, claim.currency)}</b>
            </span>

            <dl style={{ margin: 0, display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(211,154,39,.3)", fontSize: 13 }}>
              <Row label={t("orderNumber")}><span dir="ltr" style={{ unicodeBidi: "isolate", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{claim.donationId}</span></Row>
              {claim.bankName ? <Row label={t("bank")}>{claim.bankName}</Row> : null}
              {claim.bankCurrency ? <Row label={t("ibanCurrency")}><span dir="ltr">{claim.bankCurrency}</span></Row> : null}
              {claim.receiptSubmittedAt ? <Row label={t("submittedOn")}>{dateFormat.format(new Date(claim.receiptSubmittedAt))}</Row> : null}
              {claim.paidAt ? <Row label={t("confirmedOn")}>{dateFormat.format(new Date(claim.paidAt))}</Row> : null}
            </dl>

            {state === "awaiting" ? (
              <div style={{ display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(211,154,39,.3)" }}>
                <b style={{ fontSize: 13 }}>{t("whatNext")}</b>
                <NextSteps items={[t("nextReview"), t("nextEmail"), t("nextReceipt")]} compact />
              </div>
            ) : null}

            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", paddingTop: 4, borderTop: "1px solid rgba(211,154,39,.3)" }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 8a4.5 4.5 0 0 1 7.5 3c0 5.3-7.5 10-7.5 10Z" /></svg>
              {tCart("receiptNote")}
            </span>
            <Link href={miaPath("contact", locale)} className="cart-add-another" style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>
              {tSystem("contactSupport")}
            </Link>
          </aside>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function UploadForm({
  claim,
  query,
  locale,
  donorName,
  onSubmitted,
  labels,
  t,
}: {
  claim: DonorClaimView;
  query: string;
  locale: string;
  donorName: string | null;
  onSubmitted: (claim: DonorClaimView) => void;
  labels: { heading: string; hint: string; attemptsLeft: string };
  t: ReturnType<typeof useTranslations<"transferReceipt">>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [senderName, setSenderName] = useState(claim.senderName ?? donorName ?? "");
  const [transferDate, setTransferDate] = useState(claim.transferDate ? claim.transferDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState(claim.transferReference ?? "");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<UploadError>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!file || !inferReceiptMime(file).startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = useCallback((candidate: File | null) => {
    if (!candidate) return;
    const rejection = validateReceiptFile({ type: inferReceiptMime(candidate), size: candidate.size, name: candidate.name });
    if (rejection) {
      setFile(null);
      setError(rejection);
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0] ?? null);
  };

  const errorText = (code: UploadError): string | null => {
    switch (code) {
      case "type":
        return t("fileWrongType");
      case "size":
        return t("fileTooLarge", { size: file ? formatBytes(file.size) : "", max: formatBytes(MAX_RECEIPT_BYTES) });
      case "empty":
        return t("fileEmpty");
      case "closed":
        return t("closed");
      case "forbidden":
        return t("forbidden");
      case "attempts":
        return t("exhaustedLead");
      case "network":
        return t("uploadFailed");
      default:
        return null;
    }
  };

  /* XHR rather than fetch, for the one thing fetch cannot give a multi-megabyte
     upload on a phone: a progress bar. */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !file || !consent) return;
    setSubmitting(true);
    setError(null);
    setProgress(0);

    const body = new FormData();
    body.append("file", file, file.name);
    body.append("senderName", senderName);
    body.append("transferDate", transferDate);
    body.append("transferReference", reference);
    body.append("note", note);
    body.append("locale", locale);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/bank-transfer/${claim.donationId}/receipt${query}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setSubmitting(false);
      let payload: { ok?: boolean; claim?: DonorClaimView; error?: string } | null = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.claim) {
        onSubmitted(payload.claim);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const code = payload?.error ?? "";
      setError(
        code === "FILE_TYPE" ? "type"
        : code === "FILE_SIZE" ? "size"
        : code === "FILE_EMPTY" || code === "FILE_REQUIRED" ? "empty"
        : code === "CLOSED" ? "closed"
        : code === "NO_ATTEMPTS_LEFT" ? "attempts"
        : xhr.status === 403 ? "forbidden"
        : "network"
      );
    };
    xhr.onerror = () => {
      setSubmitting(false);
      setError("network");
    };
    xhr.send(body);
  };

  const remaining = claim.maxSubmissions - claim.submissionCount;

  return (
    <form className="pay-card" style={cardBox} onSubmit={submit} noValidate>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={headingStyle}>
          <span aria-hidden="true" style={headingIcon}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>
          </span>
          {labels.heading}
        </h2>
        {remaining < claim.maxSubmissions ? (
          <span style={{ fontSize: 12, fontWeight: 800, color: remaining === 1 ? "var(--red)" : "var(--muted)", padding: "5px 10px", borderRadius: 999, background: "var(--sand)" }}>{labels.attemptsLeft}</span>
        ) : null}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>{labels.hint}</p>

      <div
        role="button"
        tabIndex={0}
        aria-label={t("dropHere")}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{ display: "grid", justifyItems: "center", gap: 10, padding: file ? 14 : "28px 18px", border: `2px dashed ${dragging ? "var(--gold)" : error && !file ? "var(--red)" : file ? "rgba(31,122,77,.5)" : "var(--border)"}`, borderRadius: 12, background: dragging ? "rgba(211,154,39,.08)" : file ? "rgba(31,122,77,.05)" : "var(--ivory)", cursor: "pointer", transition: "all .18s ease", textAlign: "center" }}
      >
        <input ref={inputRef} type="file" accept={RECEIPT_ACCEPT_ATTR} onChange={(e) => pick(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
        {file ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "start" }}>
            {preview ? (
              <img src={preview} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", flex: "0 0 auto" }} />
            ) : (
              <span style={{ display: "grid", placeItems: "center", width: 72, height: 72, borderRadius: 8, background: "#fff", border: "1px solid var(--border)", color: "var(--red)", flex: "0 0 auto" }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
              </span>
            )}
            <span style={{ display: "grid", gap: 3, minWidth: 0, flex: "1 1 auto" }}>
              <b dir="ltr" style={{ fontSize: 14, unicodeBidi: "isolate", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "start" }}>{file.name}</b>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{formatBytes(file.size)}</span>
            </span>
            <span style={{ flex: "0 0 auto", fontSize: 12.5, fontWeight: 800, color: "var(--gold)" }}>{t("changeFile")}</span>
          </div>
        ) : (
          <>
            <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: "50%", background: "#fff", border: "1px solid var(--border)", color: "var(--gold)" }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>
            </span>
            <b style={{ fontSize: 14 }}>{dragging ? t("dropActive") : t("dropHere")}</b>
            <span style={{ display: "inline-flex", alignItems: "center", height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 800, color: "var(--deep)" }}>{t("chooseFile")}</span>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--red)", lineHeight: 1.7 }}>{errorText(error)}</p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }} className="tr-fields">
        <Field label={t("senderName")} hint={t("senderNameHint")}>
          <input value={senderName} onChange={(e) => setSenderName(e.target.value)} autoComplete="name" className="pay-field" style={fieldStyle} />
        </Field>
        <Field label={t("transferDate")}>
          <input type="date" value={transferDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTransferDate(e.target.value)} dir="ltr" className="pay-field" style={{ ...fieldStyle, unicodeBidi: "isolate" }} />
        </Field>
        <Field label={t("transferReference")} hint={t("transferReferenceHint")} span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" className="pay-field" style={{ ...fieldStyle, unicodeBidi: "isolate" }} />
        </Field>
        <Field label={t("note")} span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))} placeholder={t("notePlaceholder")} rows={3} className="pay-field" style={{ ...fieldStyle, height: "auto", padding: "12px 14px", resize: "vertical", fontWeight: 600 }} />
        </Field>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.7, cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 4, width: 16, height: 16, accentColor: "var(--gold)" }} />
        <span>{t("needConsent")}</span>
      </label>

      {submitting ? (
        <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "var(--gold)", transition: "width .2s ease" }} />
        </div>
      ) : null}

      <button type="submit" disabled={submitting || !file || !consent} className="mia-card-cta" style={{ width: "100%", height: 52, border: 0, borderRadius: 8, background: "var(--red)", color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 16, cursor: submitting || !file || !consent ? "not-allowed" : "pointer", opacity: submitting || !file || !consent ? 0.6 : 1, boxShadow: "var(--shadow-cta)", transition: "filter .18s ease, opacity .18s ease" }}>
        {submitting ? `${t("submitting")} ${progress}%` : t("submit")}
      </button>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function BankDetails({ bank, highlightCurrency, accountNameLabel }: { bank: MinbarBank; highlightCurrency: string | null; copyLabel: string; accountNameLabel: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      /* The value is on screen and selectable. */
    }
  };
  const rows = [
    { key: "holder", label: accountNameLabel, value: bank.holder, latin: false, dim: false },
    ...(bank.swift ? [{ key: "swift", label: "SWIFT / BIC", value: bank.swift, latin: true, dim: false }] : []),
    ...bank.currencies.map((c) => ({ key: `iban:${c.code}`, label: `IBAN · ${c.code}`, value: formatIban(c.iban), latin: true, dim: Boolean(highlightCurrency) && c.code !== highlightCurrency })),
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {bank.logo ? <img src={bank.logo} alt="" style={{ width: 44, height: 44, flex: "0 0 auto", objectFit: "contain", background: "#fff", border: "1px solid var(--border)", borderRadius: 8 }} /> : null}
        <b style={{ fontSize: 14 }}>{bank.name}</b>
      </div>
      {rows.map((row) => (
        <span key={row.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: "var(--ivory)", border: `1px solid ${row.key.startsWith("iban:") && !row.dim ? "var(--gold)" : "var(--border)"}`, borderRadius: 8, opacity: row.dim ? 0.55 : 1 }}>
          <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{row.label}</span>
            <b dir={row.latin ? "ltr" : undefined} style={{ fontSize: 13.5, unicodeBidi: row.latin ? "isolate" : undefined, wordBreak: "break-all" }}>{row.value}</b>
          </span>
          <button type="button" onClick={() => copy(row.key, row.value.replace(/\s/g, ""))} aria-label={row.label} className="pay-copy-btn" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", color: copied === row.key ? "var(--green)" : "var(--muted)", cursor: "pointer", transition: "all .18s ease" }}>
            {copied === row.key ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
            )}
          </button>
        </span>
      ))}
    </div>
  );
}

function NextSteps({ items, compact = false }: { items: string[]; compact?: boolean }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: compact ? 6 : 10 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: compact ? 12.5 : 14, lineHeight: 1.7, color: compact ? "var(--muted)" : "var(--deep)" }}>
          <span aria-hidden="true" style={{ flex: "0 0 auto", display: "grid", placeItems: "center", width: compact ? 20 : 24, height: compact ? 20 : 24, borderRadius: "50%", background: "#fff", border: "1px solid var(--border)", color: "var(--gold)", fontSize: 11, fontWeight: 900, marginTop: 1 }}>{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function FileThumb({ url, isImage, name }: { url: string; isImage: boolean; name: string }) {
  if (isImage) return <img src={url} alt={name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", flex: "0 0 auto" }} />;
  return (
    <span style={{ display: "grid", placeItems: "center", width: 48, height: 48, borderRadius: 8, background: "#fff", border: "1px solid var(--border)", color: "var(--red)", flex: "0 0 auto" }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 800, textAlign: "end", minWidth: 0 }}>{children}</dd>
    </div>
  );
}

function Field({ label, hint, span, children }: { label: string; hint?: string; span?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: span ? "1 / -1" : undefined }}>
      <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--deep)" }}>{label}</span>
        {hint ? <span style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const TONES = {
  error: { color: "var(--red)", background: "rgba(169,52,40,.1)" },
  pending: { color: "var(--gold)", background: "rgba(211,154,39,.14)" },
  success: { color: "var(--green)", background: "rgba(31,122,77,.1)" },
} as const;

const cardBox: CSSProperties = { display: "grid", gap: 14, padding: 26, background: "#fff", border: "1px solid var(--border)", borderRadius: 14 };
const headingStyle: CSSProperties = { margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 900 };
const headingIcon: CSSProperties = { display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "var(--sand)", color: "var(--gold)" };
const fieldStyle: CSSProperties = { height: 46, border: "1.5px solid var(--border)", borderRadius: 10, padding: "0 14px", fontSize: 14.5, fontWeight: 700, color: "var(--deep)", background: "var(--ivory)", fontFamily: "inherit", transition: "border-color .18s ease, background .18s ease", width: "100%", boxSizing: "border-box" };
