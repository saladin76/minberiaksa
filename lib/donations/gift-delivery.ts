import "server-only";

import { prisma } from "@/lib/prisma";
import { messagesFor } from "@/i18n/locale-messages";
import { generateThanksPdf } from "@/lib/certificates/generate";
import { ensureDonationDocuments } from "@/lib/certificates/issue";
import { sendEmailMessage } from "@/lib/communication/providers/email/client";
import { getMetaConfig, graphFetch } from "@/lib/communication/providers/meta-whatsapp/client";
import { resolveTriggerSendConfig } from "@/lib/events/dispatch";
import { getServerBaseUrl } from "@/lib/server-base-url";
import { miaPath } from "@/lib/minbar/routes";
import { writeAuditLog } from "@/lib/audit-log";

/**
 * Telling the recipient of a gifted donation.
 *
 * A campaign line can be given in someone else's name (`DonationItem.gift*`).
 * Once the donation is confirmed this sends that person, on the channels the
 * donor chose, a thank-you certificate issued in *their* name plus the donor's
 * note. Email carries the certificate as a PDF; WhatsApp carries the text and
 * a link to the project (Meta takes no attachment outside a template).
 *
 * Idempotent per line: `giftDeliveredAt` is stamped after the first attempt
 * that reached a channel, so a replayed webhook does not tell anyone twice.
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

async function sendGiftWhatsapp(to: string, body: string, phoneNumberId: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = await getMetaConfig();
  if (!config) return { ok: false, reason: "META_NOT_CONFIGURED" };
  const sender = phoneNumberId || config.defaultPhoneNumberId;
  if (!sender) return { ok: false, reason: "SENDER_MISSING_PHONE_NUMBER_ID" };
  const result = await graphFetch(config, `${sender}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { preview_url: true, body } }),
  });
  if (!result.ok) return { ok: false, reason: `${result.reason}: ${result.detail}` };
  return { ok: true };
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
  const lines = await prisma.donationItem.findMany({
    where: { donationId, giftRecipientName: { not: null }, giftDeliveredAt: null },
    include: { campaign: { select: { title: true, slug: true } } },
  });
  if (!lines.length) return result;
  result.lines = lines.length;

  const docs = await ensureDonationDocuments(donationId);
  if (!docs) return result;
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { currency: true, locale: true, donor: { select: { name: true } } },
  });
  if (!donation) return result;

  const locale = docs.locale;
  const m = giftMessages(locale);
  const [base, sendConfig] = await Promise.all([getServerBaseUrl(), resolveTriggerSendConfig()]);
  const donorName = (donation.donor?.name ?? "").trim() || (m.anonymousDonor ?? "");

  for (const line of lines) {
    const recipientName = line.giftRecipientName ?? "";
    const projectUrl = line.campaign.slug ? `${base}${miaPath("projectDetail", locale, line.campaign.slug)}` : `${base}${miaPath("projects", locale)}`;
    const vars = {
      recipientName,
      donorName,
      project: line.campaign.title,
      amount: formatAmount(line.amount, donation.currency, locale),
    };
    let reached = false;

    if (line.giftChannels.includes("EMAIL") && line.giftRecipientEmail) {
      try {
        /* The same thank-you certificate the donor gets, issued to the
           recipient: the name on the face is theirs, the serial is the
           donation's. */
        const pdf = await generateThanksPdf({ ...docs, thanks: { ...docs.thanks, donorName: recipientName } }, base);
        const sent = await sendEmailMessage({
          to: line.giftRecipientEmail,
          subject: fill(m.emailSubject, vars),
          html: giftEmailHtml(m, vars, line.giftShowAmount, line.giftMessage, projectUrl),
          senderEmail: sendConfig.emailIdentity,
          attachments: [{ filename: pdf.filename, content: pdf.pdf.toString("base64"), contentType: "application/pdf" }],
        });
        if (sent.ok) {
          result.emailsSent += 1;
          reached = true;
        } else {
          result.errors += 1;
          console.error("gift delivery email failed", { donationId, itemId: line.id, reason: sent.reason, detail: sent.detail });
        }
      } catch (error) {
        result.errors += 1;
        console.error("gift delivery email threw", { donationId, itemId: line.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (line.giftChannels.includes("WHATSAPP") && line.giftRecipientPhone) {
      const body = [
        fill(m.whatsappBody, vars),
        line.giftShowAmount ? fill(m.whatsappAmount, vars) : "",
        line.giftMessage ? `"${line.giftMessage}"` : "",
        projectUrl,
      ]
        .filter(Boolean)
        .join("\n\n");
      const sent = await sendGiftWhatsapp(line.giftRecipientPhone, body, sendConfig.whatsappSender?.phoneNumberId ?? null);
      if (sent.ok) {
        result.whatsappSent += 1;
        reached = true;
      } else {
        result.errors += 1;
        console.error("gift delivery whatsapp failed", { donationId, itemId: line.id, reason: sent.reason });
      }
    }

    /* A gift with no channel is delivered by the donor themselves; stamping
       it keeps the row out of every later pass. */
    if (reached || line.giftChannels.length === 0) {
      await prisma.donationItem.update({ where: { id: line.id }, data: { giftDeliveredAt: new Date() } }).catch(() => undefined);
    }
  }

  if (result.emailsSent || result.whatsappSent || result.errors) {
    const parts = [
      result.emailsSent ? `${result.emailsSent} بريد` : null,
      result.whatsappSent ? `${result.whatsappSent} واتساب` : null,
      result.errors ? `${result.errors} فشل` : null,
    ].filter(Boolean);
    await writeAuditLog({
      actorRole: "SYSTEM",
      action: "GIFT_DELIVERY",
      messageAr: `إبلاغ المُهدى إليهم بتبرع مُهدى — ${parts.join("، ")}`,
      entityType: "Donation",
      entityId: donationId,
      metadata: { donationId, ...result },
      stream: "TEAM",
    }).catch(() => undefined);
  }
  return result;
}
