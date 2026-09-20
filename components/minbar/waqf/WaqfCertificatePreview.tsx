"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Live preview of the waqf certificate — ported from the `#waqf-cert-preview`
 * block of `Minbar/الأوقاف.dc.html`: the official gold frame drawn in CSS with
 * the real tughra, title logotype and seal, updating as the unit, count and
 * names change. Not a flat image.
 *
 * This is a preview only (`CERTIFICATES_DOWNLOADS_HANDOFF §6`). The real
 * certificate and its number are issued by the server after payment is
 * confirmed (`DONATION_LOGIC_SPEC §2`): the number box therefore shows a
 * marked placeholder, never a value a donor could quote back, and the note
 * beneath says so. The date is today's, as the handoff previews it; the
 * issued certificate carries the confirmation date.
 *
 * The Arabic edition uses the engraved title artwork; other languages set the
 * title as text, because the artwork is Arabic calligraphy.
 */
export default function WaqfCertificatePreview({
  unit,
  count,
  total,
  name,
  onBehalf,
  open = false,
}: {
  unit: "share" | "meter";
  count: number;
  total: string;
  name: string;
  onBehalf: string;
  /** Phone only: whether the toggle button has revealed the preview. */
  open?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("certificates");
  const tWaqf = useTranslations("waqf");
  const isArabic = locale === "ar";

  /* Rendered after mount so the server and the first client paint agree. */
  const [today, setToday] = useState("");
  useEffect(() => {
    try {
      setToday(new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()));
    } catch {
      setToday(new Date().toISOString().slice(0, 10));
    }
  }, [locale]);

  const titleImage = unit === "meter" ? "/minbar/assets/cert-title-meter.png" : "/minbar/assets/cert-title-share-final.png";
  const unitLabel = unit === "meter" ? tWaqf("unitMeter") : tWaqf("unitShare");
  const countLabel = unit === "meter" ? t("countMeters") : t("countShares");

  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "center", width: "100%" }}>
      <div
        id="waqf-cert-preview"
        data-open={open ? "1" : "0"}
        style={{
          position: "relative",
          aspectRatio: "1 / 1.32",
          width: "100%",
          maxWidth: 420,
          justifySelf: "center",
          background:
            "repeating-linear-gradient(45deg, rgba(201,138,43,0) 0 8px, rgba(201,138,43,.5) 8px 9px), repeating-linear-gradient(-45deg, rgba(201,138,43,0) 0 8px, rgba(201,138,43,.5) 8px 9px), #fdf8ee",
          border: "7px solid #b9852a",
          boxShadow: "0 18px 40px rgba(16,33,43,.12)",
        }}
      >
        <div style={{ position: "absolute", inset: 18, border: "1.5px solid #b9852a", background: "#fff", padding: "20px 20px 16px", display: "grid", gridTemplateRows: "auto auto auto 1fr auto", textAlign: "center", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ display: "grid", gap: 3, justifyItems: "center" }}>
              <span style={microLabel}>{countLabel}</span>
              <span style={boxed}>{count}</span>
            </span>
            <span style={{ display: "grid", gap: 3, justifyItems: "center" }}>
              <span style={microLabel}>{t("certNoLabel")}</span>
              {/* A marked placeholder — the number is the server's, after payment. */}
              <span style={{ ...boxed, color: "var(--red)", minWidth: 56, fontSize: 10, letterSpacing: ".18em" }} title={t("waqfPreviewNumberNote")}>
                •••••
              </span>
            </span>
          </div>

          <div style={{ display: "grid", justifyItems: "center", gap: 3 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the tughra artwork */}
            <img src="/minbar/assets/cert-tughra.png" alt="" style={{ height: 38, width: "auto", objectFit: "contain" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {isArabic ? (
              // eslint-disable-next-line @next/next/no-img-element -- the engraved Arabic title
              <img src={titleImage} alt={unitLabel} style={{ display: "block", height: 62, width: "auto", maxWidth: "100%", objectFit: "contain", margin: "0 auto" }} />
            ) : (
              <b style={{ display: "block", padding: "10px 0 6px", fontSize: 19, fontWeight: 900, color: "var(--red)", letterSpacing: ".01em" }}>{unitLabel}</b>
            )}
            <p style={{ margin: "6px 0 0", fontSize: 11.5, fontWeight: 800, color: "var(--deep)" }}>{t("certifiesThat")}</p>
          </div>

          <div style={{ display: "grid", alignContent: "start", gap: 9, marginTop: 2 }}>
            <div style={{ fontSize: 10.5, color: "var(--deep)", fontWeight: 700, lineHeight: 1.7 }}>
              <span style={{ display: "inline-block", minWidth: 70, borderBottom: "1px dotted #9a8a63", fontWeight: 900 }}>{name || "……………………"}</span>{" "}
              {unit === "meter" ? t("endowedMeters") : t("endowedShares")} (<b>{count}</b>) {t("valueLabel")} (
              <b dir="ltr" style={{ unicodeBidi: "isolate" }}>
                {total}
              </b>
              )
            </div>
            <div style={{ fontSize: 10.5, color: "var(--deep)", fontWeight: 700 }}>
              {t("onBehalfLabel")}{" "}
              <span style={{ display: "inline-block", minWidth: 100, borderBottom: "1px dotted #9a8a63" }}>{onBehalf || " "}</span>
            </div>
            {/* The waqf's legal wording — reviewed content, never paraphrased. */}
            <div style={{ fontFamily: "var(--font-quran)", fontSize: 9.5, color: "var(--muted)", fontWeight: 600, lineHeight: 1.75, textAlign: "justify" }}>
              {t("waqfLegalText")}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", alignItems: "end", gap: 8, paddingTop: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the seal */}
            <img src="/minbar/assets/cert-seal.png" alt="" style={{ height: 58, width: 58, objectFit: "contain", flex: "0 0 auto" }} />
            <span aria-hidden="true" />
            <div style={{ display: "grid", gap: 3, justifyItems: "center" }}>
              <span style={{ ...microLabel, fontSize: 9, height: 20, display: "flex", alignItems: "end" }}>{today || " "}</span>
              <span style={{ width: "100%", borderTop: "1px dotted #9a8a63" }} />
              <span style={{ ...microLabel, fontSize: 9 }}>{t("dateLabel")}</span>
            </div>
          </div>
        </div>
      </div>
      <p id="waqf-cert-preview-note" data-open={open ? "1" : "0"} style={{ margin: 0, maxWidth: 420, fontSize: 11.5, lineHeight: 1.7, color: "var(--muted)", textAlign: "center" }}>
        {t("waqfPreviewNumberNote")}
      </p>
    </div>
  );
}

const microLabel: React.CSSProperties = { fontSize: 10, color: "var(--muted)", fontWeight: 700 };

const boxed: React.CSSProperties = {
  minWidth: 44,
  height: 24,
  padding: "0 6px",
  border: "1px solid #cbb892",
  borderRadius: 3,
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 12.5,
  color: "var(--deep)",
};
