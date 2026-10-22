export function isWhatsappUnsubscribeQuickReply(value: string): boolean {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .normalize("NFKC")
    .replace(/[إأآٱ]/g, "ا")
    .trim()
    .toLowerCase();
  return ["stop", "dur", "ايقاف", "الغاء الاشتراك"].includes(normalized);
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
