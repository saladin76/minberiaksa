/**
 * Qur'anic verse presentation rules, ported from `Minbar/i18n.js` →
 * `verse()` / `verseBlock()`.
 *
 * Three rules from the handoff govern every verse on the site
 * (`DEVELOPER_HANDOFF §13`, `CLAUDE.md`):
 *
 *  1. **The Arabic text is always shown**, in every language edition. It is the
 *     original, not a translation of anything.
 *  2. A translation of the *meaning* may accompany it, and when it does the
 *     attribution line is mandatory — the published edition it came from must
 *     be named on screen.
 *  3. Nothing here is machine-translated. `quran.json` is flagged
 *     `RELIGIOUS_LOCKED`; the translation-sync layer skips it entirely and only
 *     human review may change it.
 *
 * In an Arabic session there is no translation line and no attribution: Arabic
 * is the source, so presenting a "translation" of it would be wrong.
 */

/**
 * The published edition each translation is taken from. Shown verbatim beneath
 * the verse — this is the attribution requirement, not decoration.
 */
const QURAN_ATTRIBUTION: Record<string, string> = {
  ar: "ترجمة معاني القرآن الكريم — مجمع الملك فهد لطباعة المصحف الشريف",
  en: "Translation of the meanings of the Qur'an — King Fahd Complex for the Printing of the Holy Qur'an",
  tr: "Kur'an-ı Kerim meali — Kral Fahd Mushaf-ı Şerif Basım Kompleksi",
  fr: "Traduction des sens du Noble Coran — Complexe du Roi Fahd pour l'impression du Saint Coran",
  de: "Übersetzung der Bedeutungen des Korans — König-Fahd-Komplex für den Druck des Edlen Korans",
  es: "Traducción de los significados del Corán — Complejo del Rey Fahd para la impresión del Sagrado Corán",
  id: "Terjemahan makna Al-Qur'an — Kompleks Raja Fahd untuk Pencetakan Mushaf Al-Qur'an",
  pt: "Tradução dos significados do Alcorão — Complexo do Rei Fahd para a Impressão do Alcorão Sagrado",
  ur: "قرآن کریم کے معانی کا ترجمہ — شاہ فہد قرآن کریم پرنٹنگ کمپلیکس",
  sq: "Përkthimi i kuptimeve të Kuranit — Kompleksi i Mbretit Fahd për Shtypjen e Kuranit Fisnik",
  it: "Traduzione dei significati del Corano — Complesso di Re Fahd per la stampa del Nobile Corano",
  nl: "Vertaling van de betekenissen van de Koran — Koning Fahd-complex voor het drukken van de Edele Koran",
  sv: "Översättning av Koranens innebörd — Kung Fahd-komplexet för tryckning av den ädla Koranen",
  no: "Oversettelse av Koranens betydninger — Kong Fahd-komplekset for trykking av den edle Koranen",
  da: "Oversættelse af Koranens betydninger — Kong Fahd-komplekset for trykning af den ædle Koran",
  ms: "Terjemahan makna Al-Qur'an — Kompleks Raja Fahd untuk Percetakan Mushaf Al-Qur'an",
  ja: "クルアーンの意味の翻訳 — 聖クルアーン印刷のためのキング・ファハド・コンプレックス",
  zh: "古兰经含义译文 — 法赫德国王古兰经印刷厂",
  hi: "क़ुरआन के अर्थों का अनुवाद — किंग फ़हद पवित्र क़ुरआन मुद्रण परिसर",
};

export interface VerseBlock {
  /** The Arabic text. Always present, in every language edition. */
  arabic: string;
  /** Citation label, e.g. "Surah Al-Isra: 1". */
  label: string;
  /** Translation of the meaning, or null in an Arabic session. */
  translation: string | null;
  /** Edition attribution — present whenever `translation` is. */
  attribution: string;
}

/** The shape of one `quran` namespace after the dotted keys are nested. */
type QuranNamespace = Record<string, { ar?: string; label?: string; t?: string } | undefined>;

/**
 * Resolve a verse for display.
 *
 * @param quran   The `quran` namespace from the active locale's messages.
 * @param id      Verse id, e.g. `isra_1`.
 * @param locale  Active locale; drives whether a translation is shown at all.
 */
export function verseBlock(quran: QuranNamespace, id: string, locale: string): VerseBlock {
  const entry = quran?.[id] ?? {};
  // Arabic is the source, not a translation of itself — no translation line and
  // no attribution in an Arabic session.
  const translation = locale === "ar" ? null : entry.t ?? null;
  return {
    arabic: entry.ar ?? "",
    label: entry.label ?? "",
    translation,
    attribution: translation ? QURAN_ATTRIBUTION[locale] ?? QURAN_ATTRIBUTION.en : "",
  };
}
