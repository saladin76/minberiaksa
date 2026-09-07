import { buildNormalizedMessages, type LocaleMessages, type MessageObject } from "./message-quality";

import msg_ar from "./messages/ar.json";
import msg_tr from "./messages/tr.json";
import msg_en from "./messages/en.json";
import msg_fr from "./messages/fr.json";
import msg_de from "./messages/de.json";
import msg_es from "./messages/es.json";
import msg_id from "./messages/id.json";
import msg_pt from "./messages/pt.json";
import msg_ur from "./messages/ur.json";
import msg_sq from "./messages/sq.json";
import msg_it from "./messages/it.json";
import msg_nl from "./messages/nl.json";
import msg_sv from "./messages/sv.json";
import msg_no from "./messages/no.json";
import msg_da from "./messages/da.json";
import msg_ms from "./messages/ms.json";
import msg_ja from "./messages/ja.json";
import msg_zh from "./messages/zh.json";
import msg_hi from "./messages/hi.json";

/**
 * The normalized message catalog for every public locale.
 *
 * Extracted from `app/[locale]/layout.tsx` so the layout and the per-page
 * message providers read the same object — otherwise two copies of a 19-locale
 * bundle would end up in the server graph.
 *
 * The map must stay statically imported (bundled JSON). When a locale is
 * promoted in `lib/locales.ts`, add its `import` above and an entry below.
 */
const raw: LocaleMessages = {
  ar: msg_ar, tr: msg_tr, en: msg_en, fr: msg_fr, de: msg_de,
  es: msg_es, id: msg_id, pt: msg_pt, ur: msg_ur, sq: msg_sq,
  it: msg_it, nl: msg_nl, sv: msg_sv, no: msg_no, da: msg_da,
  ms: msg_ms, ja: msg_ja, zh: msg_zh, hi: msg_hi,
};

/** Gaps are filled from English — the handoff's `code → en → ar` chain. */
export const LOCALE_MESSAGES: LocaleMessages = buildNormalizedMessages(raw, "en");

export const DEFAULT_MESSAGE_LOCALE = "ar";

export function messagesFor(locale: string): MessageObject {
  return LOCALE_MESSAGES[locale] ?? LOCALE_MESSAGES[DEFAULT_MESSAGE_LOCALE];
}

/**
 * Namespaces the site shell needs on every page: the header's navigation and
 * language picker, the footer, the quick-donation widget, system states and
 * form validation.
 *
 * `PERFORMANCE_BUDGET.md` sets the rule this exists to satisfy — "حزم الترجمة:
 * Locale الحالية × Namespaces الصفحة فقط". Sending all 23 namespaces on every
 * page put ~129KB of JSON in each document; the shell is ~14KB and a page adds
 * only what it actually renders.
 */
export const SHELL_NAMESPACES = ["common", "navigation", "system", "validation", "projects"] as const;

/**
 * Legacy namespaces belonging to the pre-Minbar public pages. They stay in the
 * layout bundle because those routes are still served and read them through the
 * layout's provider; they can be dropped from here as each is replaced by its
 * ported equivalent.
 */
export const LEGACY_NAMESPACES = [
  "BankTransfer", "DonationFailed", "BlogCard", "Navbar", "HomePage", "HeroSlider",
  "CampaignsSlider", "QuickDonate", "Footer", "AboutUs", "ContactUs", "Blog",
  "CampaignsPage", "Campaign", "SignInDialog", "SharePopup", "DonationDialog",
  "DonationSuccess", "CartSheet", "LiveDonationsTicker", "Profile",
  "MessageSubjects", "CompleteProfile",
] as const;

/** Narrow a locale's catalog to the given namespaces. Unknown names are skipped. */
export function pickNamespaces(
  locale: string,
  namespaces: readonly string[]
): MessageObject {
  const all = messagesFor(locale);
  const out: MessageObject = {};
  for (const ns of namespaces) {
    if (all[ns] !== undefined) out[ns] = all[ns];
  }
  return out;
}
