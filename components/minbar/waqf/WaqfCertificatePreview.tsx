"use client";

import { useLocale, useTranslations } from "next-intl";

/**
 * Live preview of the waqf certificate — ported from the `#waqf-cert-preview`
 * block of `Minbar/الأوقاف.dc.html`.
 *
 * This is a preview only. The real certificate and its serial are issued
 * server-side after payment is confirmed (`DONATION_LOGIC_SPEC §2`): the serial
 * is never generated in the browser, reloading the page never allocates a new
 * one, and no certificate exists before confirmation. The number shown here is
 * therefore left blank rather than faked — an invented serial on screen is a
 * number a donor could quote back at the foundation.
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
}: {
  unit: "share" | "meter";
  count: number;
  total: string;
  name: string;
  onBehalf: string;
}) {
  const locale = useLocale();
  const t = useTranslations("certificates");
  const tWaqf = useTranslations("waqf");
  const isArabic = locale === "ar";

  const titleImage = unit === "meter" ? "/minbar/assets/cert-title-meter.png" : "/minbar/assets/cert-title-share-final.png";
  const unitLabel = unit === "meter" ? tWaqf("unitMeter") : tWaqf("unitShare");
  const countLabel = unit === "meter" ? t("countMeters") : t("countShares");

  return (
    <div
      id="waqf-cert-preview"
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
            {/* Issued by the server after confirmation — never guessed here. */}
            <span style={{ ...boxed, color: "var(--muted)", minWidth: 56, fontSize: 10 }}>—</span>
          </span>
        </div>

        <div style={{ display: "grid", justifyItems: "center", gap: 3 }}>
          <img src="/minbar/assets/cert-tughra.png" alt="" style={{ height: 38, width: "auto", objectFit: "contain" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          {isArabic ? (
            <img src={titleImage} alt={unitLabel} style={{ display: "block", height: 62, width: "auto", maxWidth: "100%", objectFit: "contain", margin: "0 auto" }} />
          ) : (
            <b style={{ display: "block", padding: "10px 0 6px", fontSize: 19, fontWeight: 900, color: "var(--red)", letterSpacing: ".01em" }}>{unitLabel}</b>
          )}
          <p style={{ margin: "6px 0 0", fontSize: 11.5, fontWeight: 800, color: "var(--deep)" }}>{t("certifiesThat")}</p>
        </div>

        <div style={{ display: "grid", alignContent: "start", gap: 9, marginTop: 2 }}>
          <div style={{ fontSize: 10.5, color: "var(--deep)", fontWeight: 700, lineHeight: 1.7 }}>
            <span style={{ display: "inline-block", minWidth: 70, borderBottom: "1px dotted #9a8a63", fontWeight: 900 }}>{name || "—"}</span>{" "}
            {unit === "meter" ? t("endowedMeters") : t("endowedShares")} (<b>{count}</b>) {t("valueLabel")} (
            <b dir="ltr" style={{ unicodeBidi: "isolate" }}>
              {total}
            </b>
            )
          </div>
          <div style={{ fontSize: 10.5, color: "var(--deep)", fontWeight: 700 }}>
            {t("onBehalfLabel")}{" "}
            <span style={{ display: "inline-block", minWidth: 100, borderBottom: "1px dotted #9a8a63" }}>{onBehalf || "—"}</span>
          </div>
          {/* The waqf's legal wording — reviewed content, never paraphrased. */}
          <div style={{ fontFamily: "var(--font-quran)", fontSize: 9.5, color: "var(--muted)", fontWeight: 600, lineHeight: 1.75, textAlign: "justify" }}>
            {t("waqfLegalText")}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", alignItems: "end", gap: 8, paddingTop: 6 }}>
          <img src="/minbar/assets/cert-seal.png" alt="" style={{ height: 58, width: 58, objectFit: "contain", flex: "0 0 auto" }} />
          <span aria-hidden="true" />
          <div style={{ display: "grid", gap: 3, justifyItems: "center" }}>
            {/* Dated on issue, not on preview. */}
            <span style={{ ...microLabel, height: 20, display: "flex", alignItems: "end" }}>—</span>
            <span style={{ width: "100%", borderTop: "1px dotted #9a8a63" }} />
            <span style={microLabel}>{t("dateLabel")}</span>
          </div>
        </div>
      </div>
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
