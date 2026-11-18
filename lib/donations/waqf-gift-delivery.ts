import "server-only";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { readGiftDeliveryState, giftChannelsComplete, giftNotDelivered } from "./gift-delivery-state";
import { giftCertificateToken } from "./gift-certificate-token";
import { sendGiftWhatsapp } from "./gift-whatsapp";
import { waqfGiftScope } from "./waqf-gift-scope";
import { fill, formatAmount, giftEmailHtml, giftMessages, type GiftDeliveryResult } from "./gift-delivery";
import { createDeliveryRecord, markDeliveryStatus } from "@/lib/communication/delivery-log-service";
import { automaticEmailHtml } from "@/lib/templates/font";
import { prisma } from "@/lib/prisma";
import { messagesFor } from "@/i18n/locale-messages";
import { generateWaqfPdf } from "@/lib/certificates/generate";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { sendEmailMessage } from "@/lib/communication/providers/email/client";
import { resolveTriggerSendConfig, resolveTriggerSender } from "@/lib/events/dispatch";
import { paymentPublicOrigin } from "@/lib/payment-public-origin";
import { miaPath } from "@/lib/minbar/routes";
import { writeAuditLog } from "@/lib/audit-log";

/** The attachment sentence for a waqf gift (the shared Gift texts speak of a thank-you certificate). */
const WAQF_ATTACHMENT: Record<string, string> = {
  ar: "تجد شهادة الوقف باسمك مرفقة بهذه الرسالة.",
  tr: "Adınıza düzenlenen vakıf sertifikası bu mesajın ekindedir.",
  en: "Your waqf certificate, issued in your name, is attached.",
  fr: "Votre certificat de waqf, établi à votre nom, est joint à ce message.",
};
const attachmentLine = (locale: string) => WAQF_ATTACHMENT[locale.slice(0, 2)] ?? WAQF_ATTACHMENT.en;

/** "Waqf share × 3 — Al-Quds Waqf Projects", in the donation's language. */
export function waqfGiftTitle(locale: string, unit: "SHARE" | "METER", count: number): string {
  const ns = (messagesFor(locale).waqf ?? {}) as Record<string, string>;
  const unitTitle = (unit === "METER" ? ns.unitMeter : ns.unitShare) || (unit === "METER" ? "Waqf metre" : "Waqf share");
  return [`${unitTitle} × ${count}`, ns.qudsWaqfProjects].filter(Boolean).join(" — ");
}

/** Tell every waqf gift recipient on a confirmed donation who has not been told yet. */
export async function deliverWaqfGifts(donationId: string, options: { approvalBlockedOnly?: boolean } = {}): Promise<GiftDeliveryResult> {
  const result: GiftDeliveryResult = { lines: 0, emailsSent: 0, whatsappSent: 0, errors: 0 };
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { paidAt: true, accessToken: true, currency: true, donor: { select: { name: true } } },
  });
  if (!donation?.paidAt) return result;
  const lines = await prisma.donationWaqfItem.findMany({ where: { donationId, giftRecipientName: { not: null }, AND: [giftNotDelivered] } });
  const approvalBlocked = (raw: unknown) => {
    const state = readGiftDeliveryState(raw).WHATSAPP;
    return state?.status === "FAILED" && state.reason === "GIFT_TEMPLATE_APPROVAL_REQUIRED";
  };
  const candidates = options.approvalBlockedOnly ? lines.filter(line => approvalBlocked(line.giftDeliveryState)) : lines;
  if (!candidates.length) return result;
  const docs = await ensureDonationDocuments(donationId);
  if (!docs) return result;
  const locale = docs.locale;
  const m: Record<string, string> = { ...giftMessages(locale), emailAttachment: attachmentLine(locale) };
  const base = paymentPublicOrigin("https://minberiaksa.org");
  const sendConfig = await resolveTriggerSendConfig();
  const emailSender = resolveTriggerSender(sendConfig, "EMAIL", { locale, purpose: "TRANSACTIONAL" });
  const whatsappSender = resolveTriggerSender(sendConfig, "WHATSAPP", { locale, purpose: "TRANSACTIONAL" });
  const donorName = (donation.donor?.name ?? "").trim() || (m.anonymousDonor ?? "");
  const pageUrl = base + miaPath("waqf", locale);

  for (const candidate of candidates) {
    const lock = crypto.randomUUID();
    const acquired = await prisma.donationWaqfItem.updateMany({
      where: { id: candidate.id, AND: [giftNotDelivered, { OR: [{ giftDeliveryLock: null }, { giftDeliveryLock: { isSet: false } }, { giftDeliveryLockUntil: { lt: new Date() } }] }] },
      data: { giftDeliveryLock: lock, giftDeliveryLockUntil: new Date(Date.now() + 10 * 60_000) },
    });
    if (acquired.count !== 1) continue;
    try {
      // Read after acquiring the lease; the earlier list may predate another worker.
      const line = await prisma.donationWaqfItem.findUnique({ where: { id: candidate.id } });
      if (!line || line.giftDeliveryLock !== lock || line.giftDeliveredAt) continue;
      if (options.approvalBlockedOnly && !approvalBlocked(line.giftDeliveryState)) continue;
      result.lines++;
      const state = readGiftDeliveryState(line.giftDeliveryState);
      const errors: string[] = [];
      const save = async () => {
        const saved = await prisma.donationWaqfItem.updateMany({ where: { id: line.id, giftDeliveryLock: lock }, data: { giftDeliveryState: state as unknown as Prisma.InputJsonValue } });
        if (saved.count !== 1) throw new Error("GIFT_DELIVERY_LEASE_LOST");
      };
      const recipientName = line.giftRecipientName || "";
      const giftToken = giftCertificateToken(waqfGiftScope(line.id), donationId, donation.accessToken);
      const certificateUrl = giftToken ? base + "/api/gifts/waqf/" + line.id + "/certificate?giftToken=" + giftToken : "";
      const vars = { recipientName, donorName, project: waqfGiftTitle(locale, line.unit, line.count), amount: formatAmount(line.amount, donation.currency, locale) };
      for (const channel of line.giftChannels) {
        if (options.approvalBlockedOnly && channel !== "WHATSAPP") continue;
        if (channel !== "EMAIL" && channel !== "WHATSAPP") { errors.push("UNSUPPORTED_GIFT_CHANNEL"); result.errors++; continue; }
        if (state[channel]?.status === "SENT") continue;
        if (state[channel]?.status === "SENDING") { errors.push(channel + ":OUTCOME_UNCERTAIN"); result.errors++; continue; }
        let providerStarted = false;
        try {
          const routed = channel === "EMAIL" ? emailSender : whatsappSender;
          if (!routed.ok) throw new Error(routed.reason);
          if (channel === "EMAIL") {
            if (!line.giftRecipientEmail) throw new Error("GIFT_RECIPIENT_EMAIL_MISSING");
            const cert = docs.waqf.find((c) => c.waqfItem.id === line.id);
            if (!cert) throw new Error("WAQF_CERTIFICATE_UNAVAILABLE");
            const pdf = await generateWaqfPdf(cert, base);
            const body = giftEmailHtml(m, vars, line.giftShowAmount, line.giftMessage, pageUrl);
            const archived = await createDeliveryRecord({ channel: "EMAIL", origin: "TRIGGER", purpose: "TRANSACTIONAL",
              senderId: routed.sender.id, recipientEmail: line.giftRecipientEmail, recipientName, locale, renderedSubject: fill(m.emailSubject, vars),
              renderedBody: body, variables: { giftWaqfItemId: line.id }, status: "RENDERED" });
            if (!archived.ok) throw new Error("ARCHIVE_FAILED");
            state[channel] = { status: "SENDING", at: new Date().toISOString() }; await save();
            providerStarted = true;
            const sent = await sendEmailMessage({ to: line.giftRecipientEmail, subject: fill(m.emailSubject, vars), html: automaticEmailHtml(body, locale),
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
            const text = [fill(m.whatsappBody, vars), line.giftShowAmount ? fill(m.whatsappAmount, vars) : "", line.giftMessage || "", certificateUrl, pageUrl].filter(Boolean).join("\n\n");
            state[channel] = { status: "SENDING", at: new Date().toISOString() }; await save();
            providerStarted = true;
            const sent = await sendGiftWhatsapp({ phone: line.giftRecipientPhone, name: recipientName, locale, body: text, itemId: line.id,
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
      await prisma.donationWaqfItem.updateMany({
        where: { id: line.id, giftDeliveryLock: lock },
        data: { giftDeliveryError: errors.length ? errors.join("; ").slice(0, 1000) : null,
          ...(giftChannelsComplete(line.giftChannels, state) ? { giftDeliveredAt: new Date() } : {}) },
      });
    } finally {
      await prisma.donationWaqfItem.updateMany({ where: { id: candidate.id, giftDeliveryLock: lock }, data: { giftDeliveryLock: null, giftDeliveryLockUntil: null } });
    }
  }
  if (result.lines) await writeAuditLog({ actorRole: "SYSTEM", action: "GIFT_DELIVERY",
    messageAr: "نتيجة إرسال إهداءات الوقف: " + result.emailsSent + " بريد، " + result.whatsappSent + " واتساب، " + result.errors + " أخطاء",
    entityType: "Donation", entityId: donationId, metadata: { donationId, kind: "waqf", ...result }, stream: "TEAM" });
  return result;
}
