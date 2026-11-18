/**
 * Inbox language tabs (owner, 2026-11-18): Arabic, Turkish, French, English — every other language
 * goes to English. Each conversation gets one language, decided in this order:
 *   1. the donor's language on the site (most reliable),
 *   2. the text of their message,
 *   3. their phone's country code,
 *   4. otherwise English.
 * Staff can always move a conversation to another tab by hand. Pure and dependency-free.
 */
export const INBOX_LANGUAGES = ["ar", "tr", "fr", "en"] as const;
export type InboxLanguage = (typeof INBOX_LANGUAGES)[number];
export type LanguageSource = "profile" | "text" | "phone" | "default" | "manual";
export const isInboxLanguage = (v: unknown): v is InboxLanguage => typeof v === "string" && (INBOX_LANGUAGES as readonly string[]).includes(v);

/** A site locale to a tab: ar/tr/fr stay, anything else (en, de, id, ur…) is English. */
export function languageFromLocale(locale: string | null | undefined): InboxLanguage | null {
  const l = String(locale ?? "").trim().slice(0, 2).toLowerCase();
  if (!l) return null;
  return l === "ar" || l === "tr" || l === "fr" ? l : "en";
}

const TURKISH_WORDS = /\b(merhaba|selam|teşekkür|tesekkur|sağol|sagol|bağış|bagis|nasıl|nasil|lütfen|lutfen|evet|hayır|hayir|kurban|zekat|için|icin|bir|ve|ben|bu)\b/i;
const FRENCH_WORDS = /\b(bonjour|bonsoir|salut|merci|s'il|svp|vous|je|suis|est|pour|avec|don|dons|comment|oui|non|aide|mosquée|quelle|aussi)\b/i;
const ENGLISH_WORDS = /\b(hello|hi|thanks|thank|please|donate|donation|how|what|where|yes|no|help|the|and|is|are|my|you)\b/i;

/** The message text, when it clearly shows one of the tab languages. Ambiguous text decides nothing. */
export function languageFromText(text: string | null | undefined): InboxLanguage | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const arabic = (t.match(/[\u0600-\u06FF\u0750-\u077F]/g) ?? []).length;
  const latin = (t.match(/[A-Za-zÀ-ÿĞğŞşİı]/g) ?? []).length;
  if (arabic > 0 && arabic >= latin) return "ar";
  if (/[ğĞşŞıİ]/.test(t) || TURKISH_WORDS.test(t)) return "tr";
  if (/[éèêëàâçùûôîœ]/i.test(t) || FRENCH_WORDS.test(t)) return "fr";
  if (ENGLISH_WORDS.test(t)) return "en";
  return null;
}

const ARAB_CODES = ["966", "971", "965", "974", "973", "968", "962", "961", "963", "964", "970", "20", "212", "213", "216", "218", "249", "967", "222", "252", "253", "269"];
const FRENCH_CODES = ["33", "32", "377", "221", "225", "223", "226", "227", "228", "229", "237", "241", "242", "243", "224", "235", "236", "261", "262", "509", "590", "596", "594"];

/** The phone's country, when it points to one tab language (+90 Turkish, Arab states, French-speaking). */
export function languageFromPhone(phone: string | null | undefined): InboxLanguage | null {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!d) return null;
  if (d.startsWith("90")) return "tr";
  // Longest codes first, so +212 is not read as +2…
  for (const code of [...ARAB_CODES].sort((a, b) => b.length - a.length)) if (d.startsWith(code)) return "ar";
  for (const code of [...FRENCH_CODES].sort((a, b) => b.length - a.length)) if (d.startsWith(code)) return "fr";
  return null;
}

export function classifyInboxLanguage(input: { profileLocale?: string | null; text?: string | null; phone?: string | null }): { language: InboxLanguage; source: LanguageSource } {
  const p = languageFromLocale(input.profileLocale);
  if (p) return { language: p, source: "profile" };
  const t = languageFromText(input.text);
  if (t) return { language: t, source: "text" };
  const ph = languageFromPhone(input.phone);
  if (ph) return { language: ph, source: "phone" };
  return { language: "en", source: "default" };
}
