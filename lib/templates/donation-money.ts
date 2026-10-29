import { formatTemplateMoney } from "./money";
import { metaParameterName } from "../communication/meta-parameter-name";
import { localizeReceiptFooter, receiptMoney, type ReceiptPaymentEvidence } from "./receipt-localization";
export { receiptDate } from "./receipt-localization";

// These are labels, not generated donor content. All amounts use the stored
// order currency/snapshot; rendering must never change a payment or fetch FX.
export const DONATION_MONEY_LABELS = {
  ar: ["المشاريع", "دعم الفريق", "الرسوم", "الإجمالي", "إجمالي المحاولة — التحصيل غير مؤكد"],
  tr: ["Projeler", "Ekip desteği", "Ücretler", "Toplam", "Ödeme girişimi toplamı — tahsilat doğrulanmadı"],
  en: ["Projects", "Team support", "Fees", "Total", "Attempted total — collection not confirmed"],
  fr: ["Projets", "Soutien à l’équipe", "Frais", "Total", "Total de la tentative — encaissement non confirmé"],
  de: ["Projekte", "Teamunterstützung", "Gebühren", "Gesamt", "Versuchter Gesamtbetrag — Zahlungseingang nicht bestätigt"],
  es: ["Proyectos", "Apoyo al equipo", "Comisiones", "Total", "Total del intento — cobro no confirmado"],
  id: ["Proyek", "Dukungan tim", "Biaya", "Total", "Total percobaan — penerimaan belum dikonfirmasi"],
  pt: ["Projetos", "Apoio à equipa", "Taxas", "Total", "Total da tentativa — recebimento não confirmado"],
  ur: ["منصوبے", "ٹیم کی معاونت", "فیس", "کل رقم", "کوشش کی کل رقم — وصولی کی تصدیق نہیں ہوئی"],
  sq: ["Projektet", "Mbështetje për ekipin", "Tarifat", "Gjithsej", "Shuma e tentativës — arkëtimi nuk është konfirmuar"],
  it: ["Progetti", "Sostegno al team", "Commissioni", "Totale", "Totale del tentativo — incasso non confermato"],
  nl: ["Projecten", "Teamondersteuning", "Kosten", "Totaal", "Totaal van de poging — ontvangst niet bevestigd"],
  sv: ["Projekt", "Stöd till teamet", "Avgifter", "Totalt", "Försökt totalbelopp — mottagen betalning inte bekräftad"],
  no: ["Prosjekter", "Støtte til teamet", "Gebyrer", "Totalt", "Forsøkt totalbeløp — mottatt betaling ikke bekreftet"],
  da: ["Projekter", "Støtte til teamet", "Gebyrer", "I alt", "Forsøgt totalbeløb — modtagelse ikke bekræftet"],
  ms: ["Projek", "Sokongan pasukan", "Yuran", "Jumlah", "Jumlah percubaan — penerimaan belum disahkan"],
  ja: ["プロジェクト", "チーム支援", "手数料", "合計", "決済試行の合計 — 入金未確認"],
  zh: ["项目", "团队支持", "手续费", "总额", "尝试支付总额 — 尚未确认收款"],
  hi: ["परियोजनाएँ", "टीम सहायता", "शुल्क", "कुल", "भुगतान प्रयास का कुल — प्राप्ति की पुष्टि नहीं हुई"],
} as const;

type MoneySource = ReceiptPaymentEvidence & {
  amount: number;
  teamSupport?: number | null;
  fees?: number | null;
  totalAmount: number;
  currency: string;
  paidAt?: Date | string | null;
};

export function donationMoneyFields(donation: MoneySource, locale = "ar") {
  const language = locale.toLowerCase().split(/[-_]/)[0].replace(/^nb$/, "no");
  const labels = DONATION_MONEY_LABELS[language as keyof typeof DONATION_MONEY_LABELS] ?? DONATION_MONEY_LABELS.en;
  const projectsAmount = formatTemplateMoney(donation.amount, locale, donation.currency);
  const teamSupport = formatTemplateMoney(donation.teamSupport ?? 0, locale, donation.currency);
  const fees = formatTemplateMoney(donation.fees ?? 0, locale, donation.currency);
  const total = formatTemplateMoney(donation.totalAmount, locale, donation.currency);
  // Missing/invalid historical money must not become a plausible zero receipt.
  if (!projectsAmount || !teamSupport || !fees || !total || !/^[A-Z]{3}$/.test(donation.currency)
    || [donation.amount, donation.teamSupport ?? 0, donation.fees ?? 0, donation.totalAmount].some(value => !Number.isFinite(value) || value < 0)) {
    return { projectsAmount, teamSupport, fees, amountBreakdown: "", notificationAmount: "", receiptSummary: "" };
  }
  const totalLabel = donation.paidAt ? labels[3] : labels[4];
  const parts = [`${labels[0]}: ${projectsAmount}`, `${labels[1]}: ${teamSupport}`];
  if ((donation.fees ?? 0) > 0) parts.push(`${labels[2]}: ${fees}`);
  const receiptSummary = `${totalLabel}: ${receiptMoney(donation.totalAmount, donation.currency, locale)}`;
  return {
    projectsAmount, teamSupport, fees,
    receiptSummary,
    // Single line also works inside an existing approved Meta text parameter.
    // Legacy Meta bodies already contain a currency slot/literal. Keep this
    // scalar to avoid repeating currencies; new families use receiptSummary.
    notificationAmount: total,
    amountBreakdown: `${totalLabel}: ${total} ${donation.currency} (${parts.map(part => `${part} ${donation.currency}`).join("; ")})`,
  };
}

type MoneyContext = { donation?: { amountBreakdown?: string; notificationAmount?: string; receiptSummary?: string } };
export function isDonationMoneyNotificationEvent(event: string): boolean {
  // Subscription signup/cancellation templates can describe FUTURE instalments;
  // the first order's one-off support must never become a promised future charge.
  return ["DONATION_PAID", "DONATION_FAILED", "FIRST_DONATION", "SUBSCRIPTION_PAYMENT"].includes(event);
}
const LEGACY_AMOUNT = /\{\{\s*donation\.(?:amount|totalAmount)\s*\}\}/g;
const EXPLICIT_BREAKDOWN = /\{\{\s*donation\.(?:projectsAmount|teamSupport|fees|amountBreakdown|receiptSummary)\s*\}\}/;

/** A full currency-bearing value needs one slot in new Meta templates. Legacy
 * approved schemas stay intact until their replacement is approved. */
export function donationReceiptText(text: string): string {
  return text
    .replace(/\{\{\s*donation\.(?:amount|totalAmount|amountUSD|notificationAmount)\s*\}\}\s*(?:\{\{\s*donation\.currency\s*\}\}|\b(?:USD|TRY|EUR|GBP|KWD|SAR|AED|QAR|JOD)\b)/g, "{{donation.receiptSummary}}")
    .replace(/\{\{\s*donation\.currency\s*\}\}\s*\{\{\s*donation\.(?:amount|totalAmount)\s*\}\}/g, "{{donation.receiptSummary}}")
    .replace(/(?:\$\s*)?\{\{\s*donation\.amountUSD\s*\}\}/g, "{{donation.receiptSummary}}")
    .replace(/(?:المبلغ(?:\s+الإجمالي)?|مبلغ التبرع|Amount|Donation amount|Tutar|Bağış tutarı|Montant|Betrag|Importe|Valor|Jumlah|Amaun|Shuma|Importo|Bedrag|Belopp|Beløp|رقم|金額|金额|राशि)\s*[:：]\s*(\{\{\s*donation\.receiptSummary\s*\}\})/giu, "$1");
}

/** Upgrade display text only. Never rewrite links, identifiers, or canonical
 * amount values in the context used by other templates and manual campaigns. */
export function donationNotificationText(text: string, ctx: MoneyContext, locale?: string): string {
  if (locale) text = localizeReceiptFooter(text, locale);
  if (!ctx.donation?.amountBreakdown || EXPLICIT_BREAKDOWN.test(text)) return text;
  return text.split(/(<[^>]*>|(?:https?:\/\/|\/)[^\s<>]+)/g).map(part => {
    if (part.startsWith("<") || /^(?:https?:\/\/|\/)/.test(part)) return part;
    const receipt = ctx.donation?.receiptSummary ? donationReceiptText(part) : part;
    return receipt.replace(LEGACY_AMOUNT, "{{donation.notificationAmount}}");
  }).join("");
}

/** Only human-readable email content is upgraded, not URLs or style props. */
export function donationNotificationDocument<T>(document: T, ctx: MoneyContext, locale?: string): T {
  if (!ctx.donation?.amountBreakdown && !locale) return document;
  const serialized = JSON.stringify(document);
  const upgradeMoney = !EXPLICIT_BREAKDOWN.test(serialized);
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
    const prop = result.type === "Html" ? "contents" : result.type === "Text" || result.type === "Heading" ? "text" : null;
    const props = (result.data as { props?: Record<string, unknown> } | undefined)?.props;
    if (prop && props && typeof props[prop] === "string") props[prop] = donationNotificationText(props[prop] as string, upgradeMoney ? ctx : {}, locale);
    return result;
  };
  return visit(document) as T;
}

/** Bind the expanded amount to BODY slots only. A button/header may reuse
 * the same semantic name and must retain its original scalar value. */
export function donationNotificationParameters(input: {
  values: Record<string, string>;
  scopedNames: Record<string, string>;
  positionalNames: string[];
  componentsSchema: unknown;
  notificationAmount?: string;
}): Record<string, string> {
  if (!input.notificationAmount) return input.values;
  const values = { ...input.values };
  const body = Array.isArray(input.componentsSchema)
    ? input.componentsSchema.find(part => String(part?.type).toUpperCase() === "BODY") as { text?: string } | undefined
    : undefined;
  const text = typeof body?.text === "string" ? body.text : "";
  // Explicit new mappings are authoritative; do not expand already detailed receipts.
  const slots = [...text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map(match => {
    const slot = match[1];
    const key = `body.${slot}`;
    const name = input.scopedNames[key] ?? (/^\d+$/.test(slot) ? input.positionalNames[Number(slot) - 1] : Object.values(input.scopedNames).find(name => metaParameterName(name) === slot) ?? input.positionalNames.find(name => metaParameterName(name) === slot));
    return { key, name };
  });
  if (slots.some(({ name }) => name && /^(?:donation\.)?(?:projectsAmount|teamSupport|fees|amountBreakdown)$/.test(name))) return values;
  for (const { key, name } of slots) {
    if (name === "donation.amount" || name === "donation.totalAmount") values[key] = input.notificationAmount;
  }
  return values;
}
