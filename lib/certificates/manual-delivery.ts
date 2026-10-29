import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { resolveTriggerSendConfig, resolveTriggerSender } from "../events/dispatch";
import { createDeliveryRecord, markDeliveryStatus } from "../communication/delivery-log-service";
import { sendPreparedDelivery } from "../communication/provider-router";
import { sendGiftWhatsapp } from "../donations/gift-whatsapp";
import { readGiftDeliveryState, type GiftDeliveryState } from "../donations/gift-delivery-state";
import { localeDirection, type SupportedLocale } from "../locales";
import { paymentPublicOrigin } from "../payment-public-origin";
import { RECEIPT_BRANDS } from "../templates/receipt-localization";
import { MANUAL_DOCUMENT_TEMPLATE, MANUAL_DOCUMENT_TEXT, manualDocumentTemplate } from "./manual-copy";
import { INSTITUTION_EMAIL_LOGO_PATH } from "../templates/email-assets";
import { issuedDocumentToken, manualDocumentPdf, manualDocumentTitle, type ManualDocument } from "./manual-render";

export async function deliverIssuedCertificate(id: string, channel: "EMAIL" | "WHATSAPP") {
  const token = randomUUID(), now = new Date();
  const claim = await prisma.issuedCertificate.updateMany({ where: { id, OR: [{ deliveryLockUntil: null }, { deliveryLockUntil: { isSet: false } }, { deliveryLockUntil: { lt: now } }] }, data: { deliveryLock: token, deliveryLockUntil: new Date(now.getTime() + 600_000) } });
  if (!claim.count) return { ok: false, reason: "DOCUMENT_DELIVERY_IN_PROGRESS" };
  let providerAttempted = false;
  let state: GiftDeliveryState = {};
  const save = async () => { await prisma.issuedCertificate.updateMany({ where: { id, deliveryLock: token }, data: { deliveryState: state as Prisma.InputJsonValue } }); };
  try {
    const row = await prisma.issuedCertificate.findUnique({ where: { id } });
    if (!row) return { ok: false, reason: "DOCUMENT_NOT_FOUND" };
    state = readGiftDeliveryState(row.deliveryState);
    if (state[channel]?.status === "SENT") return { ok: true, alreadySent: true };
    if (state[channel]?.status === "SENDING") return { ok: false, reason: "DELIVERY_OUTCOME_UNCERTAIN" };
    const locale = row.locale as SupportedLocale;
    const contact = channel === "EMAIL" ? row.recipientEmail : row.recipientPhone;
    if (!contact) return { ok: false, reason: "DOCUMENT_RECIPIENT_MISSING" };
    const config = await resolveTriggerSendConfig();
    const routed = resolveTriggerSender(config, channel, { locale, purpose: "TRANSACTIONAL" });
    if (!routed.ok) return { ok: false, reason: routed.reason };
    const document = row.document as unknown as ManualDocument;
    const origin = paymentPublicOrigin("https://minberiaksa.org");
    const pdf = await manualDocumentPdf(document, origin);
    const title = manualDocumentTitle(document);
    const values: Record<string, string> = { "document.title": title, "document.recipientName": row.recipientName, "document.serial": row.serial, "document.date": document.kind === "waqf" ? document.certDate : document.kind === "receipt" ? document.issueDate : document.issuedDate || new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(row.issuedAt), "document.url": `${origin}/api/certificates/issued/${row.id}?token=${issuedDocumentToken(row.id)}` };
    const body = manualDocumentTemplate(locale).replace(/\{\{([a-zA-Z.]+)\}\}/g, (_, key: string) => values[key] ?? "");
    state[channel] = { status: "SENDING", at: new Date().toISOString() }; await save();
    if (channel === "WHATSAPP") {
      providerAttempted = true;
      const sent = await sendGiftWhatsapp({ phone: contact, name: row.recipientName, locale, body, itemId: row.id, values, sender: routed.sender, templateName: MANUAL_DOCUMENT_TEMPLATE, templateRequiredReason: "DOCUMENT_TEMPLATE_APPROVAL_REQUIRED", origin: "MANUAL", archiveVariables: { issuedDocumentId: row.id, document: values }, attachment: pdf });
      if (!sent.ok) state[channel] = { status: sent.uncertain ? "SENDING" : "FAILED", at: new Date().toISOString(), reason: sent.reason };
      else state[channel] = { status: "SENT", at: new Date().toISOString(), providerMessageId: sent.providerMessageId ?? undefined };
      await save(); return sent;
    }
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const [greeting, intro, closing] = MANUAL_DOCUMENT_TEXT[locale];
    const html = `<html lang="${locale}" dir="${localeDirection(locale)}"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"></head><body style="font-family:Cairo,Arial,sans-serif;background:#f8f6f1;padding:24px"><main style="max-width:600px;margin:auto;background:white;padding:28px;border-radius:16px"><img src="${escape(origin + INSTITUTION_EMAIL_LOGO_PATH)}" alt="${escape(RECEIPT_BRANDS[locale])}" width="200" style="display:block;max-width:100%;height:auto"><h1>${escape(title)}</h1><p>${escape(greeting)} ${escape(row.recipientName)}</p><p style="line-height:1.9">${escape(intro)}</p><p>${escape(row.serial)} · ${escape(values["document.date"])}</p><a href="${escape(values["document.url"])}" style="display:inline-block;background:#a93428;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">${escape(title)}</a><p>${escape(closing)}</p><p>${escape(RECEIPT_BRANDS[locale])}</p></main></body></html>`;
    const archived = await createDeliveryRecord({ channel, provider: "ELASTIC_EMAIL", senderId: routed.sender.id, origin: "MANUAL", purpose: "TRANSACTIONAL", recipientEmail: contact, recipientName: row.recipientName, locale, renderedSubject: title, renderedBody: html, variables: { issuedDocumentId: row.id }, createdBy: row.createdById, status: "RENDERED" });
    if (!archived.ok) throw new Error("ARCHIVE_FAILED");
    providerAttempted = true;
    const sent = await sendPreparedDelivery({ channel, sender: { senderEmail: routed.sender.senderEmail }, to: contact, subject: title, html, locale, purpose: "TRANSACTIONAL", attachments: [{ filename: pdf.filename, content: pdf.pdf.toString("base64"), contentType: "application/pdf" }] });
    if (sent.ok) {
      await markDeliveryStatus(archived.data.id, "SENT", { providerMessageId: sent.providerMessageId, internalAccepted: sent.internalAccepted });
      state[channel] = { status: "SENT", at: new Date().toISOString(), providerMessageId: sent.providerMessageId ?? undefined };
    } else {
      const uncertain = /REQUEST_FAILED|TIMEOUT|INVALID_RESPONSE|HTTP_5\d\d/.test(sent.reason);
      await markDeliveryStatus(archived.data.id, "FAILED", { errorMessage: uncertain ? "DELIVERY_OUTCOME_UNCERTAIN" : sent.reason });
      state[channel] = { status: uncertain ? "SENDING" : "FAILED", at: new Date().toISOString(), reason: sent.reason };
    }
    await save(); return sent;
  } catch (error) {
    const reason = providerAttempted ? "DELIVERY_OUTCOME_UNCERTAIN" : error instanceof Error ? error.message : "DOCUMENT_PREPARATION_FAILED";
    state[channel] = { status: providerAttempted ? "SENDING" : "FAILED", at: new Date().toISOString(), reason }; await save();
    return { ok: false, reason };
  } finally {
    await prisma.issuedCertificate.updateMany({ where: { id, deliveryLock: token }, data: { deliveryLock: null, deliveryLockUntil: null } });
  }
}
