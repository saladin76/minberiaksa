import type { ConciergeFrequency, ConciergeIntent } from "./schema";

/**
 * Deterministic reading of a visitor's message: the amount, currency,
 * frequency, cause and region words it contains, in the languages the site
 * speaks most (Arabic incl. Egyptian/Levantine colloquial, English, Turkish,
 * French, German, Spanish, Indonesian/Malay, Urdu). Pure, so it is unit-tested
 * and runs before — and instead of, when the model is off — any model call.
 *
 * It is a first pass, not the final word: the model may refine the intent
 * when the words are ambiguous, but numbers found here always win over the
 * model's reading of them.
 */

export interface ParsedIntent {
  intent: ConciergeIntent | null;
  amount: number | null;
  currency: string | null;
  frequency: ConciergeFrequency | null;
  /** Region category slug suffix, e.g. "gaza", "al-quds". */
  region: string | null;
  giftRecipientName: string | null;
  needsRuling: boolean;
}

const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };

export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] ?? d);
}

const CURRENCY_WORDS: Array<[RegExp, string]> = [
  [/\$|usd|dollar|dolar|دولار|دولا|dólar|доллар|ڈالر/i, "USD"],
  [/€|eur\b|euro|يورو|avro/i, "EUR"],
  [/£|gbp|pound|sterling|جنيه\s*(استرليني|إسترليني)|باوند/i, "GBP"],
  [/₺|\btry\b|\btl\b|lira|ليرة|ليره/i, "TRY"],
  [/\bsar\b|riyal|ريال/i, "SAR"],
  [/\baed\b|dirham|درهم/i, "AED"],
  [/\bkwd\b|dinar|دينار/i, "KWD"],
  [/\bqar\b/i, "QAR"],
  [/\begp\b|جنيه/i, "EGP"],
  [/\bmyr\b|ringgit/i, "MYR"],
  [/\bidr\b|rupiah/i, "IDR"],
  [/\bpkr\b|rupee|روپے/i, "PKR"],
  [/\bcad\b/i, "CAD"],
  [/\bchf\b|franc\b/i, "CHF"],
];

const THOUSAND_WORDS = /(\d+(?:[.,]\d+)?)\s*(k\b|ألف|الف|thousand|bin\b|mille\b|tausend|mil\b)/i;

export function parseAmount(text: string): { amount: number | null; currency: string | null } {
  const t = normalizeDigits(text);
  let amount: number | null = null;
  const thousands = t.match(THOUSAND_WORDS);
  if (thousands) {
    amount = Number(thousands[1].replace(",", ".")) * 1000;
  } else {
    /* The first plain number that is not glued to a percent sign. Thousands
       separators ("1,500" / "1.500") are collapsed when both sides look like
       groups of three. */
    const m = t.match(/(?<![\d%])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)(?!\d|\s*%)/);
    if (m) {
      const raw = m[1];
      const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
      amount = Number(grouped ? raw.replace(/[.,]/g, "") : raw.replace(",", "."));
    }
  }
  if (amount !== null && !(Number.isFinite(amount) && amount > 0)) amount = null;
  let currency: string | null = null;
  for (const [re, code] of CURRENCY_WORDS) {
    if (re.test(t)) {
      currency = code;
      break;
    }
  }
  /* "جنيه" alone is Egyptian; only "جنيه استرليني" is GBP, handled above by order. */
  return { amount, currency };
}

const FREQ_WORDS: Array<[RegExp, ConciergeFrequency]> = [
  /* "Weekly" is served by the Friday plan — the site's weekly cadence. */
  [/كل\s*جمع[ةه]|يوم\s*الجمع[ةه]|جمع[ةه]|كل\s*أسبوع|كل\s*اسبوع|أسبوعي|اسبوعي|أسبوعيًا|اسبوعيا|friday|weekly|every\s*week|each\s*week|per\s*week|a\s*week|cuma|haftalık|her\s*hafta|vendredi|hebdo|chaque\s*semaine|freitag|wöchentlich|jede\s*woche|viernes|semanal|cada\s*semana|jumat|jumaat|mingguan|setiap\s*minggu|جمعہ|ہفتہ\s*وار|ہر\s*ہفتے/i, "friday"],
  [/كل\s*يوم|يومي|daily|every\s*day|each\s*day|her\s*gün|günlük|quotidien|chaque\s*jour|täglich|diario|setiap\s*hari|روزانہ/i, "daily"],
  [/كل\s*شهر|شهري|شهريا|شهريًا|بالشهر|في\s*الشهر|monthly|every\s*month|each\s*month|per\s*month|a\s*month|aylık|her\s*ay|ayda|mensuel|chaque\s*mois|par\s*mois|monatlich|pro\s*monat|mensual|al\s*mes|bulanan|per\s*bulan|ماہانہ|ہر\s*مہینے/i, "monthly"],
  [/مر[ةه]\s*واحد[ةه]|لمر[ةه]|one[-\s]?time|once\b|tek\s*sefer|bir\s*kez|une\s*fois|einmal|una\s*vez|sekali|ایک\s*بار/i, "once"],
];

export function parseFrequency(text: string): ConciergeFrequency | null {
  for (const [re, f] of FREQ_WORDS) if (re.test(text)) return f;
  if (/دوري|متكرر|recurring|regular|düzenli|régulier|regelmäßig|periódic|berkala|rutin/i.test(text)) return "monthly";
  return null;
}

const INTENT_WORDS: Array<[RegExp, ConciergeIntent]> = [
  /* A problem comes before everything: "refund my zakat donation" is a refund. */
  [/استرداد|استرد|أسترد|استرجاع|استرجع|أسترجع|ارجاع|إرجاع|رجّع|رجع\s*(لي|فلوسي|الفلوس|المبلغ)|فلوسي|عايز\s*فلوسي|خصم\s*مرتين|اتخصم\s*مرتين|مرتين|شكوى|شكوي|مشكل[ةه]|غلط|خطأ|لم\s*يصل|ما\s*وصل|موصلش|ماوصلش|refund|money\s*back|charged\s*twice|double\s*charg|complain|complaint|problem|issue\s*with|didn'?t\s*(receive|get|arrive)|not\s*received|wrong\s*amount|mistake|iade|para(mı|yı)\s*geri|iki\s*kez|şikayet|sorun|hata|rembours|plainte|problème|erreur|rückerstatt|beschwerde|problem|fehler|reembolso|queja|problema|pengembalian|keluhan|masalah|رقم\s*واپس|شکایت|مسئلہ/i, "support"],
  /* The donor's own giving comes next: "my zakat receipt" is about the receipt. */
  [/تبرعي|تبرعاتي|تبرعى|اشتراكي|خطتي|إيصالي|ايصالي|إيصال\s*التبرع|شهادتي|شهادة\s*الشكر|الخصم\s*(القادم|الجاي)|حسابي|وصل\s*تبرعي|وصلت\s*فلوسي|my\s*(donation|donations|gift|plan|subscription|receipt|certificate|account|payment|contribution)s?|next\s*(charge|payment|billing)|did\s*(my|the)\s*(donation|payment)|bağışım|bağışlarım|planım|makbuz|sertifikam|hesabım|ma\s*donation|mes\s*dons|mon\s*reçu|mon\s*compte|meine\s*spende|mein\s*konto|mi\s*donación|mis\s*donaciones|mi\s*cuenta|donasi\s*saya|akun\s*saya|میرا\s*عطیہ|میری\s*رسید|میرا\s*اکاؤنٹ/i, "account"],
  [/زكا[ةه]|zak[aâ]t|zek[aâ]t|zakah|zakaat|زکو?[ةۃہ]/i, "zakat"],
  [/وقف|waqf|vakıf|vakif|wakaf|endow/i, "waqf"],
  [/صدق[ةه]\s*جاري[ةه]|جاري[ةه]|أثر\s*مستمر|اثر\s*مستمر|مستمر|sadaqah?\s*jariy|jariyah|sadaka[-\s]?i?\s*cariye|ongoing|lasting|continuous|perpetual|sürekli|durable|dauerhaft|continuo|jariyah|صدقہ\s*جاریہ/i, "sadaqah_jariyah"],
  [/إغاث[ةه]|اغاث[ةه]|طوارئ|عاجل|كارث|مجاع[ةه]|غذاء|طعام|relief|emergency|urgent|famine|food|acil|yardım|secours|urgence|nothilfe|emergencia|darurat|bantuan|ہنگامی|امداد/i, "relief"],
  [/باسم|بإسم|عن\s*(والد|أم|أب|أخ|أخت|جد|زوج|روح)|عن\s*روح|إهداء|اهداء|هدي[ةه]|in\s*(the\s*)?name\s*of|on\s*behalf|dedicat|gift|adına|hediye|au\s*nom|cadeau|im\s*namen|geschenk|en\s*nombre|regalo|atas\s*nama|hadiah|کے\s*نام/i, "gift"],
  [/أكتر\s*حاج[ةه]|أكثر\s*حاج[ةه]|أحوج|الأحوج|محتاج[ةه]?\s*دعم|most\s*need|needs?\s*(the\s*)?most|priority|en\s*çok|en\s*acil|plus\s*besoin|am\s*dringendsten|más\s*necesit|paling\s*membutuhkan/i, "most_needed"],
  [/لا\s*أعرف|مش\s*عارف|معرفش|محتار|ساعدني|اقترح|don'?t\s*know|not\s*sure|help\s*me|suggest|recommend|bilmiyorum|öner|je\s*ne\s*sais|conseil|weiß\s*nicht|no\s*sé|tidak\s*tahu|saran|معلوم\s*نہیں/i, "explore"],
  [/ده|هذا|هذه|this\s*(project|campaign|one)|bu\s*proje|ce\s*projet|dieses|este\s*proyecto|proyek\s*ini|یہ/i, "current_page"],
];

export function parseIntent(text: string): ConciergeIntent | null {
  for (const [re, intent] of INTENT_WORDS) if (re.test(text)) return intent;
  if (parseFrequency(text) && parseFrequency(text) !== "once") return "recurring";
  return null;
}

/** Region words → the suffix of the site's `region-*` category slugs. */
const REGION_WORDS: Array<[RegExp, string]> = [
  [/غز[ةه]|gaza|gazze|غزہ/i, "gaza"],
  [/القدس|قدس|jerusalem|kudüs|quds|al-quds|jérusalem|یروشلم|القدس/i, "al-quds"],
  [/الأقصى|الاقصى|aqsa|aksa|مسجد/i, "al-aqsa"],
  [/سوريا|سورية|syria|suriye|syrie|syrien|siria|شام/i, "syria"],
  [/السودان|سودان|sudan/i, "sudan"],
  [/اليمن|يمن|yemen/i, "yemen"],
  [/لبنان|lebanon|lübnan|liban|líbano/i, "lebanon"],
  [/الصومال|صومال|somalia|somali/i, "somalia"],
  [/إثيوبيا|اثيوبيا|ethiopia|etiyopya|éthiopie/i, "ethiopia"],
  [/تشاد|chad|çad|tchad/i, "chad"],
  [/الكاميرون|كاميرون|cameroon|kamerun|cameroun/i, "cameroon"],
  [/بوركينا|burkina/i, "burkina-faso"],
  [/توغو|بنين|togo|benin|bénin/i, "togo-benin"],
  [/بنغلاديش|بنجلاديش|bangladesh|bangladeş/i, "bangladesh"],
  [/البوسنة|بوسنة|bosnia|bosna|bosnie|bosnien/i, "bosnia"],
  [/ألبانيا|البانيا|albania|arnavutluk|albanie|albanien/i, "albania"],
  [/مقدونيا|macedonia|makedonya|macédoine|mazedonien/i, "macedonia"],
  [/صربيا|serbia|sırbistan|serbie|serbien/i, "serbia"],
  [/فلسطين|palestin|filistin/i, "al-quds"],
];

export function parseRegion(text: string): string | null {
  for (const [re, slug] of REGION_WORDS) if (re.test(text)) return slug;
  return null;
}

const RULING_WORDS = /هل\s*يجوز|يجوز|حكم|فتوى|فتوي|حرام|حلال|واجب|is\s*it\s*(permissible|allowed|halal|haram)|fatwa|ruling|caiz\s*mi|fetva|hüküm|est-ce\s*(permis|licite)|fatwa|erlaubt|zulässig|es\s*lícito|bolehkah|hukum|جائز|فتویٰ/i;

export function needsRuling(text: string): boolean {
  return RULING_WORDS.test(text);
}

/** "باسم أمي" / "in the name of my father" → the named person, when it is short enough to be a name. */
export function parseGiftName(text: string): string | null {
  const m =
    text.match(/(?:باسم|بإسم|عن\s*روح|عن|إهداء\s*(?:إلى|ل)|اهداء\s*(?:الى|ل))\s+([^\d,.!?؟،]{2,40})/i) ||
    text.match(/(?:in\s*(?:the\s*)?name\s*of|on\s*behalf\s*of|dedicated?\s*to|for)\s+([^\d,.!?]{2,40})/i) ||
    text.match(/([^\d,.!?]{2,40})\s+adına/i) ||
    text.match(/(?:au\s*nom\s*de|im\s*namen\s*von|en\s*nombre\s*de|atas\s*nama)\s+([^\d,.!?]{2,40})/i);
  if (!m) return null;
  const name = m[1]
    .trim()
    .replace(/\s+(كل|every|each|her|chaque|jede|cada|setiap).*$/i, "")
    /* A dangling preposition before the amount ("باسم أمي بـ100") is not part of the name. */
    .replace(/\s+(بـ?|لـ?|في|من|with|for|of|de|para|mit|dengan)$/i, "")
    .trim();
  return name.length >= 2 ? name.slice(0, 80) : null;
}

/** "I want to donate" with no cause, place or type named — the visitor needs to be asked where. */
export function wantsToDonate(text: string): boolean {
  return /أتبرع|اتبرع|تبرع|أتصدق|اتصدق|صدق[ةه]|donat|give\b|giving|contribut|bağış|don(ner|\b)|spende|donar|donaci|donasi|derma|sedekah|عطیہ|寄付|捐|दान/i.test(text);
}

/* ── Commands: things the visitor asks the assistant to change ─────────── */

const LANGUAGE_WORDS: Array<[RegExp, string]> = [
  [/عربي|العربية|arabic|arapça|arabe|arabisch|árabe|العربي/i, "ar"],
  [/انجليزي|إنجليزي|الانجليزية|الإنجليزية|english|ingilizce|anglais|englisch|inglés|ingles|inggris|انگریزی/i, "en"],
  [/تركي|التركية|turkish|türkçe|turc|türkisch|turco|turki|ترکی/i, "tr"],
  [/فرنسي|الفرنسية|french|français|francais|fransızca|französisch|francés|frances|prancis/i, "fr"],
  [/ألماني|الماني|الألمانية|german|deutsch|almanca|allemand|alemán|jerman/i, "de"],
  [/إسباني|اسباني|الإسبانية|spanish|español|espanol|ispanyolca|espagnol|spanisch/i, "es"],
  [/إندونيسي|اندونيسي|الإندونيسية|indonesian|bahasa\s*indonesia|endonezce|indonésien/i, "id"],
  [/برتغالي|البرتغالية|portuguese|português|portugues|portekizce|portugais/i, "pt"],
  [/أردو|اردو|الأردية|urdu|urduca/i, "ur"],
  [/ألباني|الباني|الألبانية|albanian|shqip|arnavutça|albanais/i, "sq"],
  [/إيطالي|ايطالي|الإيطالية|italian|italiano|italyanca|italien/i, "it"],
  [/هولندي|الهولندية|dutch|nederlands|hollandaca|néerlandais/i, "nl"],
  [/سويدي|السويدية|swedish|svenska|isveççe|suédois/i, "sv"],
  [/نرويجي|النرويجية|norwegian|norsk|norveççe|norvégien/i, "no"],
  [/دنماركي|الدنماركية|danish|dansk|danca|danois/i, "da"],
  [/ماليزي|الماليزية|malay\b|bahasa\s*melayu|malayca|malais/i, "ms"],
  [/ياباني|اليابانية|japanese|日本語|japonca|japonais/i, "ja"],
  [/صيني|الصينية|chinese|中文|çince|chinois/i, "zh"],
  [/هندي|الهندية|hindi|हिन्दी|hintçe/i, "hi"],
];

const CURRENCY_NAMES: Array<[RegExp, string]> = [
  [/\busd\b|dollar|dolar|دولار|ドル|美元|डॉलर/i, "USD"],
  [/\beur\b|euro|يورو|avro|ユーロ|欧元|यूरो/i, "EUR"],
  [/\bgbp\b|pound|sterling|جنيه\s*(استرليني|إسترليني)|باوند|sterlin|livre/i, "GBP"],
  [/\bcad\b|canadian/i, "CAD"],
  [/\baud\b|australian/i, "AUD"],
  [/\btry\b|\btl\b|lira|ليرة|ليره|لير/i, "TRY"],
  [/\bsar\b|ريال\s*سعودي|riyal\s*saud|saudi/i, "SAR"],
  [/\baed\b|درهم\s*إماراتي|درهم\s*اماراتي|dirham\s*(uae|emirati)|إماراتي|emirati|dirham/i, "AED"],
  [/\bkwd\b|دينار\s*كويتي|kuwait/i, "KWD"],
  [/\bqar\b|ريال\s*قطري|qatar/i, "QAR"],
  [/\bbhd\b|دينار\s*بحريني|bahrain/i, "BHD"],
  [/\bomr\b|ريال\s*عماني|oman/i, "OMR"],
  [/\bjod\b|دينار\s*أردني|دينار\s*اردني|jordan/i, "JOD"],
  [/\bmad\b|درهم\s*مغربي|morocc/i, "MAD"],
];

const CHANGE_WORDS = /غير|غيّر|حول|حوّل|بدل|بدّل|اجعل|خلي|خليها|عايز.*(يكون|تكون)|عدل|عدّل|switch|change|set|make|use|turn|değiştir|yap|kullan|change|mets|passe|ändere|stell|cambia|pon|ubah|ganti|بدلو|تبدیل/i;
const LANGUAGE_CONTEXT = /لغ[ةه]|language|dil\b|langue|sprache|idioma|bahasa|زبان|言語|语言|भाषा|بالعربي|بالانجليزي|بالإنجليزي|بالتركي|in\s+(english|arabic|turkish|french|german|spanish)/i;
/* "the site", when a language is named with it, means the site language. */
const SITE_CONTEXT = /الموقع|\bsite\b|website|siteyi|sitesi|\bseite\b|\bsitio\b|\bsitus\b/i;
const CURRENCY_CONTEXT =/عمل[ةه]|currency|para\s*birimi|devise|währung|moneda|mata\s*uang|کرنسی|通貨|货币|मुद्रा|بالدولار|باليورو|بالليرة|بالريال|بالجنيه|بالدرهم|بالدينار/i;

export interface ParsedCommand {
  kind: "set_language" | "set_currency";
  locale?: string;
  currency?: string;
}

/**
 * Language and currency switches are read here so they work with the model
 * off: "غير اللغة للإنجليزية", "switch to euros", "para birimini TL yap".
 * Profile and plan changes carry free text and are left to the model.
 */
export function parseCommand(text: string): ParsedCommand | null {
  const wantsChange = CHANGE_WORDS.test(text);
  /* Currency first: "switch the site currency to Turkish lira" names a language too. */
  if (CURRENCY_CONTEXT.test(text) && (wantsChange || /بال(دولار|يورو|ليرة|ريال|جنيه|درهم|دينار)/i.test(text))) {
    for (const [re, currency] of CURRENCY_NAMES) if (re.test(text)) return { kind: "set_currency", currency };
  }
  const languageContext = LANGUAGE_CONTEXT.test(text) || (wantsChange && SITE_CONTEXT.test(text));
  if (languageContext && (wantsChange || /بال(عربي|انجليزي|إنجليزي|تركي)|in\s+(english|arabic|turkish|french)/i.test(text))) {
    for (const [re, locale] of LANGUAGE_WORDS) if (re.test(text)) return { kind: "set_language", locale };
  }
  return null;
}

/** Whether the message points at "this" project — only meaningful on a project page. */
export function mentionsCurrentPage(text: string): boolean {
  return /\b(this|these|bu|ce|cette|dieses|este|esta|ini)\b|(^|\s)(ده|دي|هذا|هذه|هاد|هاي)(\s|$|[؟?!,.،])|یہ/i.test(text);
}

/**
 * "500 over 5 months" / "على 6 شهور" / "6 ay boyunca": a total spread over a
 * span becomes a per-instalment amount at the span's cadence — months →
 * monthly, weeks → every Friday, days → daily. Null when no span is named.
 */
export function parseSpread(text: string): { periods: number; frequency: ConciergeFrequency } | null {
  const t = normalizeDigits(text);
  const m = t.match(
    /(?:over|for|across|during|within|in|خلال|على|علي|لمدة|لمدّة|مدة|مدّة|طول|boyunca|süresince|sur|pendant|durant|en|über|innerhalb|für|durante|en|selama|dalam|کے\s*دوران|میں)?\s*(\d{1,3})\s*(months?|mos?\b|شهر|شهور|أشهر|اشهر|شهرين|ay\b|aylık|mois|monat|monate|mes|meses|bulan|مہینے|مہینوں|weeks?|wks?\b|أسبوع|أسابيع|اسبوع|اسابيع|أسبوعين|اسبوعين|hafta|semaines?|wochen?|semanas?|minggu|ہفتے|ہفتوں|days?|يوم|أيام|ايام|gün|jours?|tage?|días?|dias?|hari|دن|دنوں)/i
  );
  if (!m) {
    /* Dual forms carry their own number. */
    if (/شهرين/.test(t)) return { periods: 2, frequency: "monthly" };
    if (/أسبوعين|اسبوعين/.test(t)) return { periods: 2, frequency: "friday" };
    return null;
  }
  const periods = Number(m[1]);
  if (!(periods >= 2 && periods <= 120)) return null;
  const unit = m[2].toLowerCase();
  if (/^(month|mo|شهر|شهور|أشهر|اشهر|ay|aylık|mois|monat|mes|bulan|مہین)/.test(unit)) return { periods, frequency: "monthly" };
  if (/^(week|wk|أسبوع|اسبوع|أسابيع|اسابيع|hafta|semaine|woche|semana|minggu|ہفت)/.test(unit)) return { periods, frequency: "friday" };
  if (/^(day|يوم|أيام|ايام|gün|jour|tag|día|dia|hari|دن)/.test(unit)) return { periods, frequency: "daily" };
  return null;
}

export function parseMessage(text: string): ParsedIntent {
  const parsedAmount = parseAmount(text);
  let amount = parsedAmount.amount;
  const { currency } = parsedAmount;
  let frequency = parseFrequency(text);
  /* A total over a span: the instalment is total ÷ periods, at the span's
     cadence. The span's number itself must not be read as the amount. */
  const spread = parseSpread(text);
  if (spread && amount !== null) {
    if (amount === spread.periods) {
      /* The only number in the text was the span ("donate over 5 months"). */
      amount = null;
    } else {
      amount = Math.round((amount / spread.periods) * 100) / 100;
    }
    frequency = frequency && frequency !== "once" ? frequency : spread.frequency;
  }
  const intent = parseIntent(text);
  return {
    intent,
    amount,
    currency,
    frequency,
    region: parseRegion(text),
    giftRecipientName: parseGiftName(text),
    needsRuling: needsRuling(text),
  };
}
