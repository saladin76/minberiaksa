"use client";

import { useTranslations } from "next-intl";

/**
 * Plan of the Old City — ported verbatim from the inline `#quds-map-svg` of
 * `Minbar/القدس والبلدة القديمة.dc.html`.
 *
 * The drawing is always laid out left-to-right, whatever direction the page is
 * read in: this is a map of a real place, and mirroring it would put Al-Aqsa
 * on the wrong side of the city. Only the labels are translated.
 */

const GREEN = "#1F7A4D";
const GOLD = "#D39A27";
const MUTED = "#52616B";

export default function OldCityMap() {
  const t = useTranslations("jerusalem");

  return (
    <svg
      id="quds-map-svg"
      viewBox="0 0 1100 700"
      width="100%"
      // `direction` rather than a `dir` attribute: React's SVG typings have no
      // `dir`, and the CSS property is what actually lays out the map's text.
      style={{ display: "block", height: "auto", direction: "ltr", unicodeBidi: "isolate" }}
      role="img"
      aria-label={t("mapAria")}
    >
      <rect x="0" y="0" width="1100" height="700" fill="#FFFDF8" />
      {/* The wall, as Suleiman's line runs it. */}
      <polygon points="120,90 900,70 930,600 150,630" fill="#F7F2EA" stroke={GOLD} strokeWidth="7" />

      {/* The four quarters. */}
      <polygon points="520,80 900,70 915,340 530,350" fill="rgba(211,154,39,.10)" stroke="rgba(211,154,39,.5)" strokeWidth="1.4" />
      <text x="700" y="150" textAnchor="middle" fontSize="15" fontWeight="900" fill="#A67A1E">{t("qMuslim")}</text>

      <polygon points="150,100 520,80 530,350 165,360" fill="rgba(16,33,43,.05)" stroke="rgba(16,33,43,.25)" strokeWidth="1.2" />
      <text x="330" y="150" textAnchor="middle" fontSize="14" fontWeight="800" fill={MUTED}>{t("quarterChristian")}</text>

      <polygon points="165,360 400,352 410,615 180,625" fill="rgba(16,33,43,.04)" stroke="rgba(16,33,43,.2)" strokeWidth="1.2" />
      <text x="290" y="500" textAnchor="middle" fontSize="14" fontWeight="800" fill={MUTED}>{t("quarterArmenian")}</text>

      <polygon points="410,352 640,346 650,610 420,615" fill="rgba(16,33,43,.04)" stroke="rgba(16,33,43,.2)" strokeWidth="1.2" />
      <text x="530" y="500" textAnchor="middle" fontSize="14" fontWeight="800" fill={MUTED}>{t("quarterJewish")}</text>
      <text x="530" y="524" textAnchor="middle" fontSize="11" fontWeight="700" fill="#A93428">{t("quarterJewishNote")}</text>

      {/* The Haram enclosure and the Dome. */}
      <rect x="660" y="360" width="255" height="240" fill="#FDF6E6" stroke={GOLD} strokeWidth="2.6" />
      <g transform="translate(790,470)">
        <polygon points="0,-42 30,-30 42,0 30,30 0,42 -30,30 -42,0 -30,-30" fill="#fff" stroke={GOLD} strokeWidth="2.2" />
        <circle r="18" fill={GOLD} opacity=".9" />
      </g>
      <text x="790" y="540" textAnchor="middle" fontSize="15" fontWeight="900" fill="#10212B">{t("alAqsaLabel")}</text>

      <g transform="translate(300,250)">
        <rect x="-26" y="-20" width="52" height="40" fill="#fff" stroke={MUTED} strokeWidth="1.8" />
        <circle cy="-26" r="10" fill="#D9DEE0" stroke={MUTED} strokeWidth="1.6" />
      </g>
      <text x="300" y="298" textAnchor="middle" fontSize="12" fontWeight="800" fill={MUTED}>{t("church")}</text>

      {/* The market street running north to south. */}
      <path d="M470 90 V620" stroke="rgba(211,154,39,.55)" strokeWidth="2" strokeDasharray="8 7" fill="none" />
      <text x="470" y="336" textAnchor="middle" fontSize="11" fontWeight="800" fill="#A67A1E">{t("souqKhan")}</text>

      {/* The gates: green open, grey sealed, red under occupation control. */}
      <g fontSize="12.5" fontWeight="800">
        <g textAnchor="middle">
          <circle cx="470" cy="84" r="9" fill={GREEN} />
          <text x="470" y="62" fill="#10212B">{t("gateColumn")}</text>
          <circle cx="700" cy="76" r="9" fill={GREEN} />
          <text x="700" y="54" fill="#10212B">{t("gateHerod")}</text>
          <circle cx="250" cy="94" r="9" fill={GREEN} />
          <text x="250" y="62" fill="#10212B">{t("gateNew")}</text>
        </g>
        <g>
          <circle cx="915" cy="300" r="9" fill={GREEN} />
          <text x="936" y="304" fill="#10212B">{t("gateLions")}</text>
          <circle cx="920" cy="440" r="9" fill="#9BA6AC" />
          <text x="941" y="444" fill={MUTED}>{t("gateMercyClosed")}</text>
        </g>
        <g textAnchor="end">
          <circle cx="132" cy="300" r="9" fill={GREEN} />
          <text x="110" y="304" fill="#10212B">{t("gateHebron")}</text>
          <circle cx="142" cy="520" r="9" fill={GREEN} />
          <text x="120" y="524" fill="#10212B">{t("gateDavid")}</text>
        </g>
        <g textAnchor="middle">
          <circle cx="690" cy="606" r="9" fill="#A93428" />
          <text x="690" y="638" fill="#A93428">{t("gateMoors")}</text>
        </g>
      </g>

      {/* The four walls. */}
      <g fontSize="13" fontWeight="900" fill={GOLD}>
        <text x="510" y="26" textAnchor="middle">{t("wallN")}</text>
        <text x="990" y="180" textAnchor="middle" transform="rotate(90 990 180)">{t("wallE")}</text>
        <text x="46" y="180" textAnchor="middle" transform="rotate(-90 46 180)">{t("wallW")}</text>
        <text x="330" y="676" textAnchor="middle">{t("wallS")}</text>
      </g>
    </svg>
  );
}
