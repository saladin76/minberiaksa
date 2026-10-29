import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { localeDirection, type SupportedLocale } from "../locales";
import { messagesFor } from "../../i18n/locale-messages";
import { getReceiptCopy, getThanksCopy, getWaqfCopy, loadCopyOverrides } from "./copy";
import { certificateVerse, documentDate, type ThanksDocument, type WaqfDocument, type ReceiptDocument } from "./documents";
import { renderReceiptHtml, renderThanksHtml, renderWaqfHtml } from "./render";
import { receiptMoney } from "../templates/receipt-localization";
import { htmlToPdf } from "./pdf";
import { MANUAL_DOCUMENT_TEXT } from "./manual-copy";
import type { ManualCertificateInput } from "./manual-input";

export type ManualDocument = ThanksDocument | WaqfDocument | ReceiptDocument;
export type ManualPreview = { document: ManualDocument; expiresAt: number; signature: string };
export function signManualPreview(input: ManualCertificateInput, document: ManualDocument): ManualPreview {
  const expiresAt = Date.now() + 1_800_000;
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("DOCUMENT_SIGNING_NOT_CONFIGURED");
  const signature = createHmac("sha256", secret).update(`manual-preview:${expiresAt}:${JSON.stringify(input)}:${JSON.stringify(document)}`).digest("hex");
  return { document, expiresAt, signature };
}
export function verifyManualPreview(input: ManualCertificateInput, value: unknown): value is ManualPreview {
  if (!value || typeof value !== "object" || !process.env.NEXTAUTH_SECRET) return false;
  const preview = value as ManualPreview;
  if (typeof preview.signature !== "string" || !preview.document || typeof preview.document !== "object" || !Number.isFinite(preview.expiresAt) || preview.expiresAt < Date.now() || preview.expiresAt > Date.now() + 1_800_000 || !/^[a-f0-9]{64}$/.test(preview.signature)) return false;
  const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET).update(`manual-preview:${preview.expiresAt}:${JSON.stringify(input)}:${JSON.stringify(preview.document)}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(preview.signature));
}
export function issuedDocumentToken(id: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("DOCUMENT_SIGNING_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`manual-certificate:${id}`).digest("hex");
}
export function issuedDocumentTokenMatches(id: string, token: string | null): boolean {
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !process.env.NEXTAUTH_SECRET) return false;
  return timingSafeEqual(Buffer.from(issuedDocumentToken(id)), Buffer.from(token));
}
export async function buildManualDocument(input: ManualCertificateInput, id: string, serial: string): Promise<ManualDocument> {
  const locale = input.locale as SupportedLocale, dir = localeDirection(locale);
  const date = documentDate(new Date(`${input.issueDate}T12:00:00Z`), locale);
  const overrides = await loadCopyOverrides();
  if (input.kind === "THANKS") {
    const copy = await getThanksCopy(locale, overrides);
    return { kind: "thanks", certificateId: id, donationId: "", serial, issuedDate: date, donorName: input.recipientName || input.donorName, copy: { ...copy, body: [copy.body, input.projectTitle, input.amount > 0 ? receiptMoney(input.amount, input.currency, locale) : "", input.note].filter(Boolean).join("\n") }, verse: certificateVerse(locale, "baqarah_261"), duaVerse: certificateVerse(locale, "baqarah_110"), locale, dir };
  }
  if (input.kind === "SHARE" || input.kind === "METER") {
    return { kind: "waqf", certificateId: id, donationId: "", serial, unit: input.kind === "METER" ? "meter" : "share", count: input.count, total: receiptMoney(input.amount, input.currency, locale), donorName: input.donorName, onBehalf: input.dedicatedTo || input.recipientName, certNo: serial, certDate: date, details: [input.projectTitle, input.note].filter(Boolean).join("\n"), copy: await getWaqfCopy(locale, overrides), locale, dir };
  }
  const { copy, org } = await getReceiptCopy(locale, overrides);
  const texts = messagesFor(locale) as Record<string, Record<string, string>>;
  const method = input.paymentMethod === "CASH" ? MANUAL_DOCUMENT_TEXT[locale][4] : input.paymentMethod === "PAYPAL" ? texts.system.successPaypal : input.paymentMethod === "BANK_TRANSFER" ? texts.cart.bankTransfer : texts.cart.card;
  return { kind: "receipt", donationId: "", receiptNo: serial, verifyCode: id.slice(-8).toUpperCase(), issueDate: date, payMethod: method, payStatus: copy.statusPaid, donorName: input.donorName, donorContact: [input.email, input.phone].filter(Boolean).join(" · "), lines: [{ title: input.projectTitle, kind: copy.kindDonation, amount: receiptMoney(input.amount, input.currency, locale) }], totalAmount: receiptMoney(input.amount, input.currency, locale), copy: { ...copy, docTitle: `${copy.docTitle} · ${MANUAL_DOCUMENT_TEXT[locale][3]}` }, org, copyOf: "1 / 1", pairNote: input.note, locale, dir };
}
export function manualDocumentTitle(document: ManualDocument): string {
  return document.kind === "thanks" ? document.copy.title : document.kind === "receipt" ? document.copy.docTitle : `${document.copy.certWord} ${document.unit === "meter" ? document.copy.meterUnitTitle : document.copy.shareUnitTitle}`;
}
export function manualDocumentHtml(document: ManualDocument, origin: string): Promise<string> {
  return document.kind === "thanks" ? renderThanksHtml(document, origin) : document.kind === "waqf" ? renderWaqfHtml(document, origin) : renderReceiptHtml([document], origin);
}
export async function manualDocumentPdf(document: ManualDocument, origin: string) {
  return { pdf: await htmlToPdf(await manualDocumentHtml(document, origin), { landscape: document.kind !== "receipt", marginMm: document.kind === "receipt" ? 8 : document.kind === "waqf" ? 4 : 0 }), filename: `${document.kind}-${document.kind === "receipt" ? document.receiptNo : document.serial}.pdf` };
}
