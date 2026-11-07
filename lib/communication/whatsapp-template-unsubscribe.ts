import { type SupportedLocale } from "../locales";

const COPY: Record<SupportedLocale, { button: string; footer: string }> = {
  ar: { button: "إيقاف", footer: "لإلغاء الاشتراك اضغط «إيقاف» أو أرسل STOP." },
  tr: { button: "Dur", footer: "Durdurmak için düğmeye basın veya STOP yazın." },
  en: { button: "Stop", footer: "Tap Stop or reply STOP to stop messages." },
  fr: { button: "Se désabonner", footer: "Pour vous désabonner, appuyez ou répondez STOP." },
  de: { button: "Abmelden", footer: "Zum Abmelden tippen oder mit STOP antworten." },
  es: { button: "Darse de baja", footer: "Para darte de baja, pulsa o responde STOP." },
  id: { button: "Berhenti", footer: "Untuk berhenti, tekan tombol atau balas STOP." },
  pt: { button: "Cancelar subscrição", footer: "Para cancelar, toque no botão ou responda STOP." },
  ur: { button: "پیغامات بند کریں", footer: "پیغامات بند کرنے کے لیے بٹن دبائیں یا STOP لکھیں۔" },
  sq: { button: "Çregjistrohu", footer: "Për t’u çregjistruar, shtypni ose përgjigjuni STOP." },
  it: { button: "Annulla iscrizione", footer: "Per annullare, tocca il pulsante o rispondi STOP." },
  nl: { button: "Afmelden", footer: "Tik om af te melden of antwoord met STOP." },
  sv: { button: "Avregistrera", footer: "Tryck för att avregistrera dig eller svara STOP." },
  no: { button: "Avslutt meldinger", footer: "Trykk for å stoppe meldinger eller svar STOP." },
  da: { button: "Afmeld", footer: "Tryk for at afmelde dig, eller svar STOP." },
  ms: { button: "Hentikan mesej", footer: "Untuk berhenti, tekan butang atau balas STOP." },
  ja: { button: "配信停止", footer: "配信を停止するにはボタンを押すか、STOPと返信してください。" },
  zh: { button: "退订消息", footer: "如需退订，请点击按钮或回复STOP。" },
  hi: { button: "संदेश बंद करें", footer: "संदेश बंद करने के लिए बटन दबाएँ या STOP लिखें।" },
};
function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFKC")
    .replace(/[إأآٱ]/g, "ا")
    .trim()
    .toLowerCase()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/gu, " ");
}
export function isWhatsappUnsubscribeQuickReply(value: string): boolean {
  const normalized = normalize(value);
  return normalized === "الغاء الاشتراك" || Object.values(COPY).some(copy => normalize(copy.button) === normalized);
}

export function hasWhatsappUnsubscribeQuickReply(buttons: unknown): boolean {
  return Array.isArray(buttons) && buttons.some((button) =>
    button && typeof button === "object" &&
    (button as { type?: unknown }).type === "QUICK_REPLY" &&
    typeof (button as { text?: unknown }).text === "string" &&
    isWhatsappUnsubscribeQuickReply((button as { text: string }).text),
  );
}

export function whatsappUnsubscribeCopy(locale: string): { button: string; footer: string } {
  const language = locale.toLowerCase().split(/[-_]/)[0].replace(/^nb$/, "no");
  return COPY[language as SupportedLocale] ?? COPY.en;
}
