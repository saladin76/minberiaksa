export function isWhatsappUnsubscribeQuickReply(value: string): boolean {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFKC")
    .replace(/[إأآٱ]/g, "ا")
    .trim()
    .toLowerCase()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/gu, " ");
  return ["stop", "dur", "ايقاف", "الغاء الاشتراك"].includes(normalized);
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
  switch (locale.toLowerCase()) {
    case "ar":
      return { button: "إيقاف", footer: "لإلغاء الاشتراك اضغط «إيقاف» أو أرسل STOP." };
    case "tr":
      return { button: "Dur", footer: "Durdurmak için düğmeye basın veya STOP yazın." };
    default:
      return { button: "Stop", footer: "Tap Stop or reply STOP to stop messages." };
  }
}
