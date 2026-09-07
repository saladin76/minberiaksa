"use client";

import { useTranslations } from "next-intl";

/**
 * Plan of the blessed Al-Aqsa Mosque — ported verbatim from the inline SVG of
 * `Minbar/المسجد الأقصى.dc.html`.
 *
 * The drawing is always laid out left-to-right, whatever direction the page is
 * read in: it is a plan of a real enclosure, and mirroring it would put the
 * Qibli musalla at the wrong end. Only the labels are translated.
 *
 * The plan's whole point is the distinction the page argues for above it: the
 * golden Dome of the Rock and the lead-domed Qibli musalla are two buildings
 * inside one walled mosque, not the mosque itself.
 */

const GOLD = "#D39A27";
const GREEN = "#1F7A4D";
const RED = "#A93428";
const MUTED = "#52616B";
const GREY = "#9BA6AC";

export default function AqsaPlan() {
  const t = useTranslations("aqsa");

  return (
    <svg
      viewBox="0 0 1020 700"
      width="100%"
      // `direction` rather than a `dir` attribute: React's SVG typings have no
      // `dir`, and the CSS property is what actually lays out the plan's text.
      style={{ display: "block", height: "auto", direction: "ltr", unicodeBidi: "isolate" }}
      role="img"
      aria-label={t("mapAria")}
    >
      <defs>
        <pattern id="aqsa-court" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#F7F2EA" />
          <path d="M0 14 14 0" stroke="rgba(211,154,39,.18)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="1020" height="700" fill="#FFFDF8" />
      {/* The wall. Everything inside it is the mosque. */}
      <polygon points="940,70 90,90 100,620 930,600" fill="url(#aqsa-court)" stroke={GOLD} strokeWidth="6" />

      {/* The raised court, with the Dome of the Rock at its centre. */}
      <g stroke={GOLD} strokeWidth="2" fill="#fff">
        <rect x="520" y="190" width="280" height="260" />
      </g>
      <text x="800" y="180" textAnchor="end" fontSize="16" fontWeight="800" fill="#10212B">{t("mapCourt")}</text>
      <g transform="translate(660,320)">
        <polygon points="0,-58 41,-41 58,0 41,41 0,58 -41,41 -58,0 -41,-41" fill="#FDF6E6" stroke={GOLD} strokeWidth="2.6" />
        <circle cx="0" cy="0" r="26" fill={GOLD} opacity=".9" />
        <circle cx="0" cy="0" r="26" fill="none" stroke="#A67A1E" strokeWidth="1.4" />
        <path d="M0-34v-12" stroke="#A67A1E" strokeWidth="2.4" />
      </g>
      <text x="660" y="418" textAnchor="middle" fontSize="17" fontWeight="900" fill="#10212B">{t("mapDomeRock")}</text>
      <g transform="translate(660,208)">
        <circle r="14" fill="#fff" stroke={GOLD} strokeWidth="2.2" />
        <circle r="5" fill={GOLD} opacity=".55" />
      </g>
      <text x="684" y="212" fontSize="12" fontWeight="700" fill={MUTED}>{t("mapChainDome")}</text>

      {/* The Qibli musalla, with the Old Aqsa and the Marwani beneath it. */}
      <rect x="140" y="170" width="170" height="150" fill="#fff" stroke="#10212B" strokeWidth="2.4" opacity=".9" />
      <ellipse cx="195" cy="228" rx="28" ry="24" fill="#D9DEE0" stroke={MUTED} strokeWidth="1.6" />
      <text x="258" y="250" textAnchor="middle" fontSize="16" fontWeight="900" fill="#10212B">{t("mapMusalla")}</text>
      <text x="258" y="278" textAnchor="middle" fontSize="16" fontWeight="900" fill="#10212B">{t("mapQibli2")}</text>
      <rect x="140" y="336" width="170" height="34" fill="none" stroke={RED} strokeWidth="1.6" strokeDasharray="5 5" />
      <text x="225" y="359" textAnchor="middle" fontSize="12" fontWeight="800" fill={RED}>{t("mapOldAqsa")}</text>
      <rect x="130" y="420" width="185" height="150" fill="none" stroke={RED} strokeWidth="2.2" strokeDasharray="7 6" />
      <text x="222" y="488" textAnchor="middle" fontSize="14" fontWeight="800" fill={RED}>{t("mapMusalla")}</text>
      <text x="222" y="516" textAnchor="middle" fontSize="14" fontWeight="800" fill={RED}>{t("mapMarwani2")}</text>

      {/* Water: the Qaytbay sabil and the Cup ablution fountain. */}
      <g fill={MUTED} fontSize="12" fontWeight="700">
        <g transform="translate(560,150)">
          <circle r="11" fill="#fff" stroke={MUTED} strokeWidth="1.6" />
          <path d="M-4 0h8M0-4v8" stroke={MUTED} strokeWidth="1.4" />
        </g>
        <text x="542" y="154" textAnchor="end">{t("mapQaytbay")}</text>
        <g transform="translate(430,330)">
          <circle r="11" fill="#fff" stroke={MUTED} strokeWidth="1.6" />
          <path d="M-4 0h8M0-4v8" stroke={MUTED} strokeWidth="1.4" />
        </g>
        <text x="412" y="334" textAnchor="end">{t("mapKas")}</text>
      </g>

      {/* The four standing minarets. */}
      <g fill="#10212B" fontSize="11.5" fontWeight="800">
        <rect x="916" y="96" width="18" height="18" fill={GOLD} />
        <text x="906" y="110" textAnchor="end">{t("mapMnrGhawanima")}</text>
        <rect x="916" y="560" width="18" height="18" fill={GOLD} />
        <text x="906" y="574" textAnchor="end">{t("mapMnrAsbat")}</text>
        <rect x="430" y="78" width="18" height="18" fill={GOLD} />
        <text x="456" y="92">{t("mapMnrSilsila")}</text>
        <rect x="104" y="96" width="18" height="18" fill={GOLD} />
        <text x="130" y="110">{t("mapMnrFakhriya")}</text>
      </g>

      {/* The gates: green open, red under occupation control, grey sealed. */}
      <g fontSize="12.5" fontWeight="800">
        <g>
          <circle cx="936" cy="150" r="9" fill={GREEN} />
          <text x="958" y="154" fill="#10212B">{t("mapGGhawanima")}</text>
          <circle cx="934" cy="270" r="9" fill={GREEN} />
          <text x="956" y="274" fill="#10212B">{t("mapGFaisal")}</text>
          <circle cx="933" cy="390" r="9" fill={GREEN} />
          <text x="955" y="394" fill="#10212B">{t("mapGHitta")}</text>
          <circle cx="931" cy="510" r="9" fill={GREEN} />
          <text x="953" y="514" fill="#10212B">{t("mapGAsbat")}</text>
        </g>
        <g textAnchor="middle">
          <circle cx="820" cy="84" r="9" fill={GREEN} />
          <text x="820" y="64" fill="#10212B">{t("mapGNazir")}</text>
          <circle cx="720" cy="86" r="9" fill={GREEN} />
          <text x="720" y="46" fill="#10212B">{t("mapGHadid")}</text>
          <circle cx="620" cy="88" r="9" fill={GREEN} />
          <text x="620" y="64" fill="#10212B">{t("mapGQattanin")}</text>
          <circle cx="520" cy="90" r="9" fill={GREEN} />
          <text x="520" y="46" fill="#10212B">{t("mapGMathara")}</text>
          <circle cx="380" cy="92" r="9" fill={GREEN} />
          <text x="380" y="64" fill="#10212B">{t("mapGSilsila")}</text>
          <circle cx="240" cy="95" r="9" fill={RED} />
          <text x="240" y="46" fill={RED}>{t("mapGMaghariba")}</text>
        </g>
        <g textAnchor="middle">
          <circle cx="560" cy="610" r="9" fill={GREY} />
          <text x="560" y="636" fill={MUTED}>{t("mapRahmaClosed")}</text>
          <rect x="92" y="300" width="8" height="70" fill={GREY} />
          <rect x="93" y="400" width="8" height="55" fill={GREY} />
          <text x="196" y="666" fill={MUTED}>{t("mapSouthClosed")}</text>
        </g>
      </g>

      {/* The four walls. The southern one carries the direction of prayer. */}
      <g fontSize="13" fontWeight="900" fill={GOLD}>
        <text x="996" y="350" textAnchor="middle" transform="rotate(90 996 350)">{t("mapWallNorth")}</text>
        <text x="32" y="350" textAnchor="middle" transform="rotate(-90 32 350)">{t("mapWallSouthQibla")}</text>
        <text x="330" y="24" textAnchor="middle">{t("mapWallWest")}</text>
        <text x="800" y="666" textAnchor="middle">{t("mapWallEast")}</text>
      </g>
    </svg>
  );
}
