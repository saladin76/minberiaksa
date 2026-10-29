import type { SupportedLocale } from "../locales";

export const RECEIPT_BRANDS: Record<SupportedLocale, string> = {
  ar: "مؤسسة منبر الأقصى الدولية", tr: "Uluslararası Minberi Aksâ Derneği", en: "Minberi Aksa International Association",
  fr: "Association internationale Minberi Aksa", de: "Internationaler Verein Minberi Aksa", es: "Asociación Internacional Minberi Aksa",
  id: "Asosiasi Internasional Minberi Aksa", pt: "Associação Internacional Minberi Aksa", ur: "بین الاقوامی منبر اقصیٰ تنظیم",
  sq: "Shoqata Ndërkombëtare Minberi Aksa", it: "Associazione Internazionale Minberi Aksa", nl: "Internationale Vereniging Minberi Aksa",
  sv: "Internationella föreningen Minberi Aksa", no: "Den internasjonale foreningen Minberi Aksa", da: "Den internationale forening Minberi Aksa",
  ms: "Persatuan Antarabangsa Minberi Aksa", ja: "ミンベリ・アクサ国際協会", zh: "敏贝里阿克萨国际协会", hi: "मिनबेरी अक्सा अंतरराष्ट्रीय संस्था",
};

export const RECEIPT_BANK_COPY: Record<SupportedLocale, readonly [string, string]> = {
  ar: ["المقابل البنكي لنفس التبرع", "عولجت هذه العملية بالليرة التركية عبر البنك التركي وفق سعر الصرف المثبت عند الدفع."],
  tr: ["Aynı bağışın bankada tahsil edilen karşılığı", "Bu ödeme, Türkiye’deki bankamız aracılığıyla ödeme anında belirlenen kur üzerinden Türk lirası olarak işlenmiştir."],
  en: ["Bank charge for this same donation", "This payment was processed in Turkish lira through our Turkish bank at the exchange rate fixed at the time of payment."],
  fr: ["Montant bancaire correspondant au même don", "Ce paiement a été traité en livres turques par notre banque en Turquie, au taux de change fixé lors du paiement."],
  de: ["Bankseitiger Gegenwert derselben Spende", "Diese Zahlung wurde über unsere Bank in der Türkei zum beim Bezahlen festgelegten Wechselkurs in türkischer Lira abgewickelt."],
  es: ["Importe bancario correspondiente a esta misma donación", "Este pago se procesó en liras turcas a través de nuestro banco en Turquía, al tipo de cambio fijado al pagar."],
  id: ["Nilai yang ditagihkan bank untuk donasi yang sama", "Pembayaran ini diproses dalam lira Turki melalui bank kami di Turki dengan kurs yang ditetapkan saat pembayaran."],
  pt: ["Valor bancário correspondente ao mesmo donativo", "Este pagamento foi processado em liras turcas pelo nosso banco na Turquia, à taxa de câmbio fixada no momento do pagamento."],
  ur: ["اسی عطیے کے لیے بینک میں وصول کی گئی رقم", "یہ ادائیگی ترکی میں ہمارے بینک کے ذریعے ترک لیرا میں، ادائیگی کے وقت طے شدہ شرح تبادلہ پر عمل میں آئی۔"],
  sq: ["Shuma e arkëtuar nga banka për të njëjtin dhurim", "Kjo pagesë u përpunua në lira turke përmes bankës sonë në Turqi, me kursin e këmbimit të përcaktuar në momentin e pagesës."],
  it: ["Importo bancario corrispondente alla stessa donazione", "Questo pagamento è stato elaborato in lire turche tramite la nostra banca in Turchia, al tasso di cambio fissato al momento del pagamento."],
  nl: ["Bankbedrag voor dezelfde donatie", "Deze betaling is via onze bank in Turkije in Turkse lira verwerkt, tegen de wisselkoers die bij het betalen is vastgelegd."],
  sv: ["Bankens debitering för samma donation", "Betalningen behandlades i turkiska lira via vår bank i Turkiet, till den växelkurs som fastställdes vid betalningen."],
  no: ["Bankbeløpet for den samme donasjonen", "Denne betalingen ble behandlet i tyrkiske lire gjennom banken vår i Tyrkia, til valutakursen som ble fastsatt ved betaling."],
  da: ["Bankbeløbet for den samme donation", "Denne betaling blev behandlet i tyrkiske lira gennem vores bank i Tyrkiet til den valutakurs, der blev fastsat ved betalingen."],
  ms: ["Amaun bank bagi sumbangan yang sama", "Pembayaran ini diproses dalam lira Turki melalui bank kami di Turki pada kadar pertukaran yang ditetapkan semasa pembayaran."],
  ja: ["同じ寄付に対する銀行決済額", "このお支払いは、決済時に確定した為替レートに基づき、トルコの取引銀行を通じてトルコリラで処理されました。"],
  zh: ["同一笔捐款的银行扣款金额", "此笔款项通过我们在土耳其的银行，以付款时确定的汇率换算为土耳其里拉处理。"],
  hi: ["इसी दान के लिए बैंक में वसूल की गई राशि", "यह भुगतान तुर्की में हमारे बैंक के माध्यम से भुगतान के समय तय विनिमय दर पर तुर्की लीरा में संसाधित किया गया।"],
};

export function receiptLocale(locale: string): SupportedLocale {
  const key = locale.toLowerCase().split(/[-_]/)[0].replace(/^nb$/, "no");
  return key in RECEIPT_BANK_COPY ? key as SupportedLocale : "en";
}

/** Only replace the known legacy bilingual closing, never names, links or user content. */
export function localizeReceiptFooter(text: string, locale: string): string {
  return text.replace(/Minbar Al-Aqsa\s*\|\s*منبر الأقصى/g, RECEIPT_BRANDS[receiptLocale(locale)]);
}

export type ReceiptPaymentEvidence = {
  provider?: string | null; providerOrderId?: string | null; providerRaw?: unknown;
  paidAt?: Date | string | null; status?: string;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A paid order AND its matching immutable request snapshot are required. No FX lookup.
 * Albaraka stores minor units; PayFor stores a decimal amount. Recurring charges
 * have their own cycle/order snapshot and must never reuse a signup's conversion. */
export function confirmedTryCharge(donation: ReceiptPaymentEvidence): number | null {
  if (!donation.paidAt || !Number.isFinite(new Date(donation.paidAt).getTime()) || donation.status && donation.status !== "PAID" || !donation.providerOrderId) return null;
  const raw = record(donation.providerRaw);
  const requests = donation.provider === "ALBARAKA" ? [record(raw.albarakaRequest), record(raw.albarakaRecurring)]
    : donation.provider === "PAYFOR" ? [record(raw.payforRequest)] : [];
  for (const request of requests) {
    if (request.orderId !== donation.providerOrderId) continue;
    if (donation.provider === "ALBARAKA") {
      if (request.currencyCode !== "TL" || !/^[1-9]\d*$/.test(String(request.amount))) continue;
      const minor = Number(request.amount);
      if (Number.isSafeInteger(minor)) return minor / 100;
    } else if (String(request.currency) === "949" && /^\d+(?:\.\d{1,2})?$/.test(String(request.purchAmount))) {
      const amount = Number(request.purchAmount);
      if (Number.isFinite(amount) && amount > 0 && Number.isSafeInteger(Math.round(amount * 100))) return amount;
    }
  }
  return null;
}

export function receiptMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(receiptLocale(locale), { style: "currency", currency, currencyDisplay: "name" }).format(amount);
}

export function receiptDate(date: Date | string, locale: string): string {
  const value = new Date(date);
  return Number.isFinite(value.getTime()) ? new Intl.DateTimeFormat(receiptLocale(locale), { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(value) : "";
}
