import "server-only";

import { sendArchivedEmail } from "@/lib/communication/system-email";
import { miaPath } from "@/lib/minbar/routes";
import { withDonationToken } from "@/lib/donations/access-token";
import { isValidLocale } from "@/lib/locales";
import type { ClaimWithDonation } from "./bank-transfer-claims";
import { claimStatusPath, safeMoney, BANK_TRANSFER_MAX_SUBMISSIONS } from "./bank-transfer-shared";

/**
 * The three emails `DONATION_LOGIC_SPEC §3` asks for: receipt received,
 * confirmed, rejected (with the reason and the way back in).
 *
 * Plain transactional mail through `sendArchivedEmail`, so each one is logged
 * as a delivery like every other system message. The official receipt on
 * confirmation is not built here — it is whatever the DONATION_PAID trigger
 * sends, the same as for a card payment; this email is the human note that
 * the transfer was matched, with the receipt PDF one click away.
 *
 * Four hand-written languages; everything else reads English, which is the
 * fallback chain the site's own messages use.
 */

export type BankTransferEmailEvent = "RECEIPT_RECEIVED" | "CONFIRMED" | "REJECTED";

type Copy = {
  received: { subject: string; title: string; body: string; cta: string };
  confirmed: { subject: string; title: string; body: string; cta: string; receipt: string };
  rejected: { subject: string; title: string; body: string; reason: string; retry: string; noRetry: string; cta: string };
  amount: string;
  reference: string;
  signature: string;
};

const COPY: Record<"ar" | "en" | "tr" | "fr", Copy> = {
  ar: {
    received: {
      subject: "استلمنا إيصال تحويلك — قيد المراجعة",
      title: "وصلنا إيصال التحويل",
      body: "شكرًا لك. استلم فريقنا المالي إيصال التحويل وسيطابقه مع الحساب البنكي خلال يوم إلى ثلاثة أيام عمل. سنراسلك فور اعتماده.",
      cta: "متابعة حالة التبرع",
    },
    confirmed: {
      subject: "تم تأكيد تبرعك — جزاك الله خيرًا",
      title: "تم تأكيد التحويل",
      body: "طابق فريقنا المالي تحويلك مع الحساب البنكي، وأصبح تبرعك مسجّلًا رسميًا. تقبّل الله منك.",
      cta: "صفحة التبرع",
      receipt: "تنزيل الإيصال الرسمي (PDF)",
    },
    rejected: {
      subject: "لم نتمكن من مطابقة إيصال التحويل",
      title: "الإيصال يحتاج إلى مراجعة",
      body: "راجع فريقنا المالي الإيصال المرفوع ولم يتمكن من مطابقته مع ما وصل إلى الحساب البنكي.",
      reason: "السبب",
      retry: "يمكنك رفع إيصال آخر — صورة أوضح أو مستند التحويل من تطبيق البنك — من الرابط التالي.",
      noRetry: "استُنفدت محاولات الرفع لهذا التبرع. تواصل معنا مباشرة ومعك الإيصال لنكمل المطابقة يدويًا.",
      cta: "رفع إيصال آخر",
    },
    amount: "المبلغ",
    reference: "رقم الطلب",
    signature: "مؤسسة منبر الأقصى الدولية",
  },
  en: {
    received: {
      subject: "We received your transfer receipt — under review",
      title: "Your transfer receipt is in",
      body: "Thank you. Our finance team has received the receipt and will match it against the bank account within one to three working days. You will hear from us as soon as it is approved.",
      cta: "Track the donation",
    },
    confirmed: {
      subject: "Your donation is confirmed — thank you",
      title: "Transfer confirmed",
      body: "Our finance team matched your transfer against the bank account, and your donation is now officially recorded. May Allah accept it from you.",
      cta: "Donation page",
      receipt: "Download the official receipt (PDF)",
    },
    rejected: {
      subject: "We could not match your transfer receipt",
      title: "The receipt needs another look",
      body: "Our finance team reviewed the uploaded receipt and could not match it against what reached the bank account.",
      reason: "Reason",
      retry: "You can upload another receipt — a clearer photo, or the transfer document from your banking app — using the link below.",
      noRetry: "The upload attempts for this donation are used up. Please contact us directly with the receipt so we can complete the match by hand.",
      cta: "Upload another receipt",
    },
    amount: "Amount",
    reference: "Order number",
    signature: "Minbar Al-Aqsa International Foundation",
  },
  tr: {
    received: {
      subject: "Havale dekontunuzu aldık — inceleniyor",
      title: "Dekontunuz ulaştı",
      body: "Teşekkür ederiz. Finans ekibimiz dekontu aldı ve bir ila üç iş günü içinde banka hesabıyla eşleştirecek. Onaylandığında size haber vereceğiz.",
      cta: "Bağış durumunu takip et",
    },
    confirmed: {
      subject: "Bağışınız onaylandı — teşekkür ederiz",
      title: "Havale onaylandı",
      body: "Finans ekibimiz havalenizi banka hesabıyla eşleştirdi; bağışınız artık resmî olarak kayıtlı. Allah kabul etsin.",
      cta: "Bağış sayfası",
      receipt: "Resmî makbuzu indir (PDF)",
    },
    rejected: {
      subject: "Havale dekontunuzu eşleştiremedik",
      title: "Dekontun yeniden incelenmesi gerekiyor",
      body: "Finans ekibimiz yüklenen dekontu inceledi ve banka hesabına ulaşan tutarla eşleştiremedi.",
      reason: "Sebep",
      retry: "Aşağıdaki bağlantıdan başka bir dekont yükleyebilirsiniz — daha net bir fotoğraf veya banka uygulamasındaki havale belgesi.",
      noRetry: "Bu bağış için yükleme hakları tükendi. Eşleştirmeyi elle tamamlayabilmemiz için dekontla birlikte doğrudan bize ulaşın.",
      cta: "Başka bir dekont yükle",
    },
    amount: "Tutar",
    reference: "Sipariş numarası",
    signature: "Minber-i Aksa Uluslararası Vakfı",
  },
  fr: {
    received: {
      subject: "Nous avons reçu votre reçu de virement — en cours d'examen",
      title: "Votre reçu de virement est arrivé",
      body: "Merci. Notre équipe financière a reçu le reçu et le rapprochera du compte bancaire sous un à trois jours ouvrés. Vous serez informé dès son approbation.",
      cta: "Suivre le don",
    },
    confirmed: {
      subject: "Votre don est confirmé — merci",
      title: "Virement confirmé",
      body: "Notre équipe financière a rapproché votre virement du compte bancaire ; votre don est désormais officiellement enregistré. Qu'Allah l'accepte de votre part.",
      cta: "Page du don",
      receipt: "Télécharger le reçu officiel (PDF)",
    },
    rejected: {
      subject: "Nous n'avons pas pu rapprocher votre reçu de virement",
      title: "Le reçu doit être réexaminé",
      body: "Notre équipe financière a examiné le reçu envoyé et n'a pas pu le rapprocher de ce qui est parvenu sur le compte bancaire.",
      reason: "Motif",
      retry: "Vous pouvez envoyer un autre reçu — une photo plus nette ou le document de virement de votre application bancaire — via le lien ci-dessous.",
      noRetry: "Les tentatives d'envoi pour ce don sont épuisées. Contactez-nous directement avec le reçu afin que nous terminions le rapprochement manuellement.",
      cta: "Envoyer un autre reçu",
    },
    amount: "Montant",
    reference: "Numéro de commande",
    signature: "Fondation internationale Minbar Al-Aqsa",
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(lang: string, title: string, paragraphs: string[], button: { label: string; href: string } | null, extraLink: { label: string; href: string } | null, footer: string): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#f4efe6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#10212b">
<main style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7dfd0">
  <div style="height:6px;background:#d39a27"></div>
  <div style="padding:28px 28px 8px;text-align:${align}">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.4">${escapeHtml(title)}</h1>
    ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.8">${p}</p>`).join("")}
    ${button ? `<p style="margin:22px 0 6px"><a href="${button.href}" style="display:inline-block;padding:12px 22px;background:#a5243d;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(button.label)}</a></p>` : ""}
    ${extraLink ? `<p style="margin:6px 0 0;font-size:14px"><a href="${extraLink.href}" style="color:#a5243d">${escapeHtml(extraLink.label)}</a></p>` : ""}
  </div>
  <div style="padding:16px 28px 26px;font-size:12px;color:#6b6b6b;text-align:${align}">${escapeHtml(footer)}</div>
</main></body></html>`;
}

export async function sendBankTransferEmail(event: BankTransferEmailEvent, claim: ClaimWithDonation, opts: { locale: string; origin: string }): Promise<void> {
  try {
    const donor = claim.donation.donor;
    if (!donor.email) return;
    const lang = (opts.locale in COPY ? opts.locale : "en") as keyof typeof COPY;
    const pageLocale = isValidLocale(opts.locale) ? opts.locale : "en";
    const c = COPY[lang];
    const amount = safeMoney(claim.donation.totalAmount, claim.donation.currency, pageLocale);
    const facts = `<span style="color:#6b6b6b">${escapeHtml(c.amount)}:</span> <b dir="ltr">${escapeHtml(amount)}</b> &nbsp;·&nbsp; <span style="color:#6b6b6b">${escapeHtml(c.reference)}:</span> <span dir="ltr">${escapeHtml(claim.donationId)}</span>`;
    const statusUrl = `${opts.origin}${claimStatusPath(claim, pageLocale, true)}`;

    let subject: string;
    let html: string;
    if (event === "RECEIPT_RECEIVED") {
      subject = c.received.subject;
      html = layout(lang, c.received.title, [escapeHtml(c.received.body), facts], { label: c.received.cta, href: statusUrl }, null, c.signature);
    } else if (event === "CONFIRMED") {
      subject = c.confirmed.subject;
      /* The guest's token rides on both links: without it the success page
         and the receipt are closed to anyone holding only the id. */
      const successUrl = withDonationToken(`${opts.origin}${miaPath("donationSuccess", pageLocale)}/${claim.donationId}`, claim.donation.accessToken);
      const receiptUrl = withDonationToken(`${opts.origin}/api/donations/${claim.donationId}/receipt?locale=${encodeURIComponent(pageLocale)}`, claim.donation.accessToken);
      html = layout(lang, c.confirmed.title, [escapeHtml(c.confirmed.body), facts], { label: c.confirmed.cta, href: successUrl }, { label: c.confirmed.receipt, href: receiptUrl }, c.signature);
    } else {
      subject = c.rejected.subject;
      const canRetry = claim.submissionCount < BANK_TRANSFER_MAX_SUBMISSIONS;
      const paragraphs = [
        escapeHtml(c.rejected.body),
        claim.rejectionReason ? `<b>${escapeHtml(c.rejected.reason)}:</b> ${escapeHtml(claim.rejectionReason)}` : "",
        facts,
        escapeHtml(canRetry ? c.rejected.retry : c.rejected.noRetry),
      ].filter(Boolean);
      html = layout(lang, c.rejected.title, paragraphs, canRetry ? { label: c.rejected.cta, href: statusUrl } : null, null, c.signature);
    }

    await sendArchivedEmail({
      to: donor.email,
      subject,
      html,
      recipientUserId: donor.id,
      recipientName: donor.name,
      locale: lang,
      origin: "SYSTEM",
      purpose: "TRANSACTIONAL",
      templateName: `BANK_TRANSFER_${event}`,
    });
  } catch (error) {
    console.error(`[bank-transfer] ${event} email failed`, error);
  }
}
