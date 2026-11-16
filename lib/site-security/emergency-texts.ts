/** Donation-pause texts. No imports: shared by the server check and the browser banner. */
export type PauseTexts = { banner: string; refused: string };
const PAUSE_TEXTS: Record<"ar" | "tr" | "en" | "fr", PauseTexts> = {
  ar: { banner: "نجري تحسينات على نظام التبرع، وسيعود خلال وقت قصير بإذن الله. يمكنكم تصفح المشاريع حتى ذلك الحين.", refused: "التبرع متوقف مؤقتاً لإجراء تحسينات. يرجى المحاولة بعد قليل." },
  tr: { banner: "Bağış sistemimizde iyileştirmeler yapıyoruz; kısa süre içinde yeniden hizmetinizde olacak. Bu sırada projelerimize göz atabilirsiniz.", refused: "Bağış, iyileştirmeler nedeniyle geçici olarak durduruldu. Lütfen biraz sonra tekrar deneyin." },
  en: { banner: "We are making improvements to our donation system; it will be back shortly. You can browse our projects in the meantime.", refused: "Donations are temporarily paused for improvements. Please try again shortly." },
  fr: { banner: "Nous apportons des améliorations à notre système de dons ; il sera de retour sous peu. Vous pouvez parcourir nos projets en attendant.", refused: "Les dons sont temporairement suspendus pour des améliorations. Veuillez réessayer dans quelques instants." },
};
/** Arabic, Turkish, English, French; every other locale reads the English text. */
export function pauseTexts(locale: string | null | undefined): PauseTexts {
  const l = String(locale ?? "").slice(0, 2).toLowerCase();
  return l === "ar" || l === "tr" || l === "fr" ? PAUSE_TEXTS[l] : PAUSE_TEXTS.en;
}
/** The donor's locale for an API call: the site's locale cookie, else the page that made the call. */
export function requestLocale(cookieLocale: string | undefined, referer: string | null): string | null {
  if (cookieLocale && /^[a-z]{2}$/i.test(cookieLocale)) return cookieLocale;
  const m = referer?.match(/^https?:\/\/[^/]+\/([a-z]{2})(?:\/|$)/i);
  return m ? m[1] : null;
}

