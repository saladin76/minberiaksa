import "server-only";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { readGiftDeliveryState, giftChannelsComplete, giftNotDelivered } from "./gift-delivery-state";
import { giftCertificateToken } from "./gift-certificate-token";
import { sendGiftWhatsapp } from "./gift-whatsapp";
import { createDeliveryRecord, markDeliveryStatus } from "@/lib/communication/delivery-log-service";
import { applyAppFont } from "@/lib/templates/font";

import { prisma } from "@/lib/prisma";
import { messagesFor } from "@/i18n/locale-messages";
import { generateThanksPdf } from "@/lib/certificates/generate";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { sendEmailMessage } from "@/lib/communication/providers/email/client";
import { resolveTriggerSendConfig, resolveTriggerSender } from "@/lib/events/dispatch";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { miaPath } from "@/lib/minbar/routes";
import { writeAuditLog } from "@/lib/audit-log";
import { donationCampaignTitle } from "@/lib/templates/donation-projects";

/**
 * Telling the recipient of a gifted donation.
 *
 * A campaign line can be given in someone else's name (`DonationItem.gift*`).
 * Once the donation is confirmed this sends that person, on the channels the
 * donor chose, a thank-you certificate issued in *their* name plus the donor's
 * note. Email carries the certificate as a PDF; WhatsApp carries the text and
 * a link to the project (Meta takes no attachment outside a template).
 *
 * Each channel has its own durable outcome and a per-line lease. Completion
 * requires every requested channel; uncertain responses are held for review.
 * Every failure is logged and never blocks the donor's own notifications.
 */

type GiftMessages = Record<string, string>;

function giftMessages(locale: string): GiftMessages {
  const ns = messagesFor(locale).Gift;
  return ns && typeof ns === "object" ? (ns as GiftMessages) : {};
}

function fill(template: string | undefined, vars: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function formatAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function giftEmailHtml(m: GiftMessages, vars: Record<string, string>, showAmount: boolean, message: string | null, projectUrl: string): string {
  const rtl = /[؀-ۿ]/.test(vars.recipientName + (m.title ?? ""));
  const lines = [
    `<h2 style="margin:0 0 12px;font-size:20px;color:#10212b">${escapeHtml(fill(m.emailTitle, vars))}</h2>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#22313a">${escapeHtml(fill(m.emailBody, vars))}</p>`,
    showAmount ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#22313a">${escapeHtml(fill(m.emailAmount, vars))}</p>` : "",
    message
      ? `<blockquote style="margin:0 0 16px;padding:12px 16px;border-inline-start:3px solid #d39a27;background:#faf6ec;font-size:15px;line-height:1.8;color:#22313a">${escapeHtml(message)}</blockquote>`
      : "",
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.8;color:#5b6b75">${escapeHtml(fill(m.emailAttachment, vars))}</p>`,
    `<p style="margin:0"><a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#d39a27;color:#10212b;font-weight:800;text-decoration:none">${escapeHtml(m.emailCta ?? "")}</a></p>`,
  ];
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}"><body style="margin:0;padding:24px;background:#f5f1e8;font-family:Segoe UI,Tahoma,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:28px;background:#fff;border-radius:14px;border:1px solid rgba(211,154,39,.35)">${lines.join("")}</div></body></html>`;
}

export interface GiftDeliveryResult {
  lines: number;
  emailsSent: number;
  whatsappSent: number;
  errors: number;
}

/** Tell every gift recipient on a confirmed donation who has not been told yet. */
export async function deliverDonationGifts(donationId: string): Promise<GiftDeliveryResult> {
  const result: GiftDeliveryResult = { lines: 0, emailsSent: 0, whatsappSent: 0, errors: 0 };
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { paidAt: true, accessToken: true, currency: true, locale: true, donor: { select: { name: true } } },
  });
  if (!donation?.paidAt) return result;
  const lines = await prisma.donationItem.findMany({
    where: { donationId, giftRecipientName: { not: null }, AND: [giftNotDelivered] },
    include: { campaign: { select: { title: true, slug: true, translations: { select: { locale: true, title: true } } } } },
  });
  if (!lines.length) return result;
  const docs = await ensureDonationDocuments(donationId);
  if (!docs) return result;
  const locale = docs.locale;
  const m = giftMessages(locale);
  const base = paymentPublicOrigin("https://minberiaksa.org");
  const sendConfig = await resolveTriggerSendConfig();
  const emailSender = resolveTriggerSender(sendConfig, "EMAIL", { locale, purpose: "TRANSACTIONAL" });
  const whatsappSender = resolveTriggerSender(sendConfig, "WHATSAPP", { locale, purpose: "TRANSACTIONAL" });
  const donorName = (donation.donor?.name ?? "").trim() || (m.anonymousDonor ?? "");

  for (const candidate of lines) {
    const lock = crypto.randomUUID();
    const acquired = await prisma.donationItem.updateMany({
      where: { id: candidate.id, AND: [giftNotDelivered, { OR: [{ giftDeliveryLock: null }, { giftDeliveryLock: { isSet: false } }, { giftDeliveryLockUntil: { lt: new Date() } }] }] },
      data: { giftDeliveryLock: lock, giftDeliveryLockUntil: new Date(Date.now() + 10 * 60_000) },
    });
    if (acquired.count !== 1) continue;
    try {
      // Read after acquiring the lease; the earlier list may predate another worker.
      const line = await prisma.donationItem.findUnique({ where: { id: candidate.id }, include: { campaign: { select: { title: true, slug: true, translations: { select: { locale: true, title: true } } } } } });
      if (!line || line.giftDeliveryLock !== lock || line.giftDeliveredAt) continue;
      result.lines++;
      const state = readGiftDeliveryState(line.giftDeliveryState);
      const errors: string[] = [];
      const save = async () => {
        const saved = await prisma.donationItem.updateMany({ where: { id: line.id, giftDeliveryLock: lock }, data: { giftDeliveryState: state as unknown as Prisma.InputJsonValue } });
        if (saved.count !== 1) throw new Error("GIFT_DELIVERY_LEASE_LOST");
      };
      const recipientName = line.giftRecipientName || "";
      const projectUrl = line.campaign.slug ? base + miaPath("projectDetail", locale, line.campaign.slug) : base + miaPath("projects", locale);
      const giftToken = giftCertificateToken(line.id, donationId, donation.accessToken);
      const certificateUrl = giftToken ? base + "/api/gifts/" + line.id + "/certificate?giftToken=" + giftToken : "";
      const vars = { recipientName, donorName, project: donationCampaignTitle(line.campaign, locale), amount: formatAmount(line.amount, donation.currency, locale) };
      for (const channel of line.giftChannels) {
        if (channel !== "EMAIL" && channel !== "WHATSAPP") { errors.push("UNSUPPORTED_GIFT_CHANNEL"); result.errors++; continue; }
        if (state[channel]?.status === "SENT") continue;
        if (state[channel]?.status === "SENDING") { errors.push(channel + ":OUTCOME_UNCERTAIN"); result.errors++; continue; }
        let providerStarted = false;
        try {
          const routed = channel === "EMAIL" ? emailSender : whatsappSender;
          if (!routed.ok) throw new Error(routed.reason);
          if (channel === "EMAIL") {
            if (!line.giftRecipientEmail) throw new Error("GIFT_RECIPIENT_EMAIL_MISSING");
            const pdf = await generateThanksPdf({ ...docs, thanks: { ...docs.thanks, donorName: recipientName } }, base);
            const archived = await createDeliveryRecord({ channel: "EMAIL", origin: "TRIGGER", purpose: "TRANSACTIONAL",
              senderId: routed.sender.id, recipientEmail: line.giftRecipientEmail, recipientName, locale, renderedSubject: fill(m.emailSubject, vars),
              renderedBody: giftEmailHtml(m, vars, line.giftShowAmount, line.giftMessage, projectUrl), variables: { giftItemId: line.id }, status: "RENDERED" });
            if (!archived.ok) throw new Error("ARCHIVE_FAILED");
            state[channel] = { status: "SENDING", at: new Date().toISOString() }; await save();
            providerStarted = true;
            const sent = await sendEmailMessage({ to: line.giftRecipientEmail, subject: fill(m.emailSubject, vars),
              html: applyAppFont(giftEmailHtml(m, vars, line.giftShowAmount, line.giftMessage, projectUrl), locale),
              senderEmail: routed.sender.senderEmail, purpose: "TRANSACTIONAL", locale,
              attachments: [{ filename: pdf.filename, content: pdf.pdf.toString("base64"), contentType: "application/pdf" }] });
            if (!sent.ok) {
              providerStarted = /REQUEST_FAILED|INVALID_RESPONSE|TIMEOUT|HTTP_5\d\d/.test(sent.reason);
              await markDeliveryStatus(archived.data.id, "FAILED", { errorMessage: sent.reason });
              throw new Error(sent.reason);
            }
            state[channel] = { status: "SENT", at: new Date().toISOString(), providerMessageId: sent.providerMessageId }; await save();
            await markDeliveryStatus(archived.data.id, "SENT", { providerMessageId: sent.providerMessageId });
            result.emailsSent++;
          } else {
            if (!line.giftRecipientPhone) throw new Error("GIFT_RECIPIENT_PHONE_MISSING");
            if (!certificateUrl) throw new Error("GIFT_CERTIFICATE_LINK_UNAVAILABLE");
            const body = [fill(m.whatsappBody, vars), line.giftShowAmount ? fill(m.whatsappAmount, vars) : "", line.giftMessage || "", certificateUrl, projectUrl].filter(Boolean).join("\n\n");
            state[channel] = { status: "SENDING", at: new Date().toISOString() }; await save();
            providerStarted = true;
            const sent = await sendGiftWhatsapp({ phone: line.giftRecipientPhone, name: recipientName, locale, body, itemId: line.id,
              sender: routed.sender, values: { "1": recipientName, "2": donorName, "3": vars.project, "4": line.giftShowAmount ? vars.amount : "—", "5": line.giftMessage || "—", "6": certificateUrl,
                "gift.recipientName": recipientName, "gift.donorName": donorName, "gift.project": vars.project, "gift.message": line.giftMessage || "—", "gift.amount": line.giftShowAmount ? vars.amount : "—", "gift.certificateUrl": certificateUrl } });
            if (!sent.ok) { providerStarted = sent.uncertain === true; throw new Error(sent.reason); }
            state[channel] = { status: "SENT", at: new Date().toISOString(), providerMessageId: sent.providerMessageId }; await save();
            result.whatsappSent++;
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : "GIFT_DELIVERY_FAILED";
          // A lost response or failure after acceptance is not a safe resend.
          if (state[channel]?.status !== "SENT") {
            state[channel] = { status: providerStarted ? "SENDING" : "FAILED", at: new Date().toISOString(), reason };
            await save();
          }
          errors.push(channel + ":" + reason); result.errors++;
        }
      }
      await prisma.donationItem.updateMany({
        where: { id: line.id, giftDeliveryLock: lock },
        data: { giftDeliveryError: errors.length ? errors.join("; ").slice(0, 1000) : null,
          ...(giftChannelsComplete(line.giftChannels, state) ? { giftDeliveredAt: new Date() } : {}) },
      });
    } finally {
      await prisma.donationItem.updateMany({ where: { id: candidate.id, giftDeliveryLock: lock }, data: { giftDeliveryLock: null, giftDeliveryLockUntil: null } });
    }
  }
  if (result.lines) await writeAuditLog({ actorRole: "SYSTEM", action: "GIFT_DELIVERY",
    messageAr: "نتيجة إرسال الإهداءات: " + result.emailsSent + " بريد، " + result.whatsappSent + " واتساب، " + result.errors + " أخطاء",
    entityType: "Donation", entityId: donationId, metadata: { donationId, ...result }, stream: "TEAM" });
  return result;
}
