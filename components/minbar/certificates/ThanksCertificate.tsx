"use client";

import { useLocale, useTranslations } from "next-intl";
import { localeDirection } from "@/lib/locales";

/**
 * The thank-you certificate — ported from `Minbar/شهادة الشكر لوحة.dc.html`,
 * the landscape plaque variant the success page shows.
 *
 * Everything scales from the sheet's own width via container query units
 * (`cqw`), so the same component is a full-page certificate, a preview inside
 * the success page, and a print sheet without a second set of sizes.
 *
 * The two Qur'anic verses stay in Arabic in every language: a verse is not
 * translated on the face of a certificate, and the handoff sets neither a
 * translation nor a citation here.
 */

/** Al-Baqarah 261 — the verse the design engraves at the head of the plaque. */
const VERSE = "﴿مَثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ﴾";

/** Al-Muzzammil 20 — the closing supplication. */
const DUA_VERSE = "﴿وَمَا تُقَدِّمُوا لِأَنفُسِكُم مِّنْ خَيْرٍ تَجِدُوهُ عِندَ اللَّهِ﴾";

const GOLD = "#D39A27";

export interface ThanksCertificateProps {
  /** The name engraved on the plaque. Empty renders a blank line to write on. */
  donorName: string;
}

export default function ThanksCertificate({ donorName }: ThanksCertificateProps) {
  const locale = useLocale();
  const t = useTranslations("certificates");

  /* The certificate sheet itself is always laid out right-to-left: its frame,
     seal and signature block are an Arabic document, whatever language the
     surrounding page is read in. Only the body copy follows the reader. */
  const bodyDir = localeDirection(locale);
  const basmala = "بسم الله الرحمن الرحيم";

  return (
    <div
      className="cert-sheet"
      dir="rtl"
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
        fontFamily: "var(--font-cairo), Cairo, system-ui, sans-serif",
        color: "#10212B",
      }}
    >
      <div aria-hidden="true" className="cert-ground" />
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative sheet artwork, sized in container units */}
      <img
        src="/minbar/assets/aqsa-dome-line.png"
        alt=""
        aria-hidden="true"
        style={{ position: "absolute", insetInline: "26%", bottom: "5%", width: "48%", height: "auto", opacity: 0.09, pointerEvents: "none" }}
      />

      {/* Three nested rules and four corner brackets — the plaque's frame. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: "2.4%", border: `2.5px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "3.6%", border: "1px solid rgba(211,154,39,.55)" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: "4.8%", border: "1px dashed rgba(211,154,39,.5)" }} />
      <div aria-hidden="true" style={{ position: "absolute", top: "2.4%", insetInlineStart: "2.4%", width: 92, height: 92, borderTop: `6px solid ${GOLD}`, borderInlineStart: `6px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", top: "2.4%", insetInlineEnd: "2.4%", width: 92, height: 92, borderTop: `6px solid ${GOLD}`, borderInlineEnd: `6px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", bottom: "2.4%", insetInlineStart: "2.4%", width: 92, height: 92, borderBottom: `6px solid ${GOLD}`, borderInlineStart: `6px solid ${GOLD}` }} />
      <div aria-hidden="true" style={{ position: "absolute", bottom: "2.4%", insetInlineEnd: "2.4%", width: 92, height: 92, borderBottom: `6px solid ${GOLD}`, borderInlineEnd: `6px solid ${GOLD}` }} />

      <div className="cert-body" style={{ position: "relative", height: "100%", padding: "3.2% 9% 2.4%", display: "grid", gridTemplateRows: "auto auto 1fr auto", textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- sized as a share of the sheet, not in pixels */}
          <img src="/minbar/assets/logo-horizontal.png" alt={t("orgName")} style={{ width: "20%", maxWidth: 190, height: "auto" }} />
          <span style={{ marginTop: 14, fontFamily: "var(--font-amiri), Amiri, serif", fontSize: "clamp(11px,1.5cqw,20px)", color: "#10212B", letterSpacing: ".02em" }}>
            {basmala}
          </span>
          <p style={{ margin: 0, width: "100%", fontFamily: "var(--font-amiri), Amiri, serif", fontSize: "clamp(12px,1.78cqw,25px)", fontWeight: 700, lineHeight: 1.9, color: "#7C2318", whiteSpace: "nowrap" }}>
            {VERSE}
          </p>
        </div>

        <div style={{ display: "grid", justifyItems: "center", gap: 6, padding: "1.6% 0" }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-amiri), Amiri, serif", fontSize: "clamp(34px,5.4cqw,74px)", fontWeight: 700, letterSpacing: ".04em", color: "#A93428", lineHeight: 1.35, whiteSpace: "nowrap" }}>
            {t("thanksTitle")}
          </h1>
        </div>

        <div className="cert-main" dir={bodyDir} style={{ display: "grid", alignContent: "center", justifyItems: "center", gap: 16 }}>
          <div style={{ display: "grid", justifyItems: "center", gap: 6, width: "100%" }}>
            <span style={{ fontSize: "clamp(11px,1.5cqw,20px)", fontWeight: 700, color: "#52616B", whiteSpace: "nowrap" }}>
              {t("nameLabel")}
            </span>
            {/* The name line keeps its height when empty, so a certificate
                printed before the donor typed a name has a rule to write on. */}
            <span style={{ display: "grid", placeItems: "center", width: "100%", minHeight: 44, padding: "4px 6px", fontSize: "clamp(18px,2.95cqw,40px)", fontWeight: 800, color: "#10212B", whiteSpace: "nowrap" }}>
              {donorName}
            </span>
          </div>

          <p style={{ margin: 0, width: "82%", fontSize: "clamp(11px,1.44cqw,19px)", lineHeight: 2.05, color: "#132C38" }}>
            {t("thanksBody")}
          </p>

          <p dir="rtl" style={{ margin: "6px 0 0", width: "100%", fontFamily: "var(--font-amiri), Amiri, serif", fontSize: "clamp(13px,2cqw,28px)", fontWeight: 700, lineHeight: 1.8, color: "#7C2318", whiteSpace: "nowrap" }}>
            {DUA_VERSE}
          </p>
          <p style={{ margin: 0, width: "82%", fontSize: "clamp(12px,1.62cqw,21px)", lineHeight: 2.05, color: "#132C38" }}>
            {t("duaText")}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: "2.2%", alignSelf: "end" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- sized in container units */}
          <img src="/minbar/assets/cert-seal-alpha.png" alt="" aria-hidden="true" style={{ width: "clamp(66px,7.4cqw,112px)", height: "auto" }} />
          <div style={{ display: "grid", justifyItems: "end", gap: 6, textAlign: "end" }}>
            <span style={{ fontFamily: "var(--font-amiri), Amiri, serif", fontSize: "clamp(13px,1.6cqw,23px)", fontWeight: 700, color: "#B8811C", whiteSpace: "nowrap" }}>
              {t("motto")}
            </span>
            <span style={{ fontSize: "clamp(10px,1.2cqw,16px)", fontWeight: 700, color: "#132C38", whiteSpace: "nowrap" }}>
              {t("orgName")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
