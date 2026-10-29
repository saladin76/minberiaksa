import "server-only";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit-log";
import { sendArchivedEmail } from "../communication/system-email";
import { paymentPublicOrigin } from "../payment-public-origin";
import { receiptMoney, RECEIPT_BRANDS, receiptLocale } from "../templates/receipt-localization";
import { INSTITUTION_EMAIL_LOGO_PATH } from "../templates/email-assets";
import { subscriptionRequestCopy, subscriptionRequestKindIndex } from "./subscription-request-copy";
import { tgNotify } from "../telegram/client";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function notifySubscriptionRequest(id: string, completed = false) {
  const row = await prisma.subscriptionServiceRequest.findUnique({ where: { id } });
  if (!row) return;
  const donor = await prisma.user.findUnique({ where: { id: row.donorId }, select: { email: true, name: true } });
  const copy = subscriptionRequestCopy(row.locale), locale = receiptLocale(row.locale);
  const title = completed ? copy[10] : copy[7], kind = copy[subscriptionRequestKindIndex(row.kind)];
  const origin = paymentPublicOrigin("https://minberiaksa.org");
  await writeAuditLog({ actorRole: "SYSTEM", action: completed ? "SUBSCRIPTION_REQUEST_COMPLETED" : "SUBSCRIPTION_REQUEST_RECEIVED", entityType: "SubscriptionServiceRequest", entityId: id, stream: "TEAM", messageAr: completed ? "اكتمل تنفيذ طلب إدارة تبرع دوري" : "طلب جديد لإدارة تبرع دوري", metadata: { subscriptionId: row.subscriptionId, kind: row.kind, status: row.status } });
  if (!completed) await tgNotify(`طلب إدارة تبرع دوري\n${row.kind}\n${origin}/dashboard/monthly#subscription-requests`).catch(() => false);
  if (!donor?.email) return;
  const details = [kind, row.requestedAmount !== null ? receiptMoney(row.requestedAmount, row.currency, locale) : "", row.note].filter(Boolean).map(escape).join("<br>");
  const html = `<!doctype html><html lang="${locale}" dir="${["ar", "ur"].includes(locale) ? "rtl" : "ltr"}"><head><meta charset="utf-8"></head><body style="background:#f8f6f1;padding:20px"><main style="max-width:580px;margin:auto;background:white;padding:24px;border-radius:12px"><img width="180" src="${origin + INSTITUTION_EMAIL_LOGO_PATH}" alt="${escape(RECEIPT_BRANDS[locale])}"><h1>${escape(title)}</h1><p>${escape(donor.name || "")}</p><p>${details}</p>${completed ? "" : `<p>${escape(copy[11])}</p>`}<p><a href="${origin}/${locale}/profile">${escape(copy[0])}</a></p><p>${escape(RECEIPT_BRANDS[locale])}</p></main></body></html>`;
  await sendArchivedEmail({ to: donor.email, subject: title, html, locale, recipientUserId: row.donorId, recipientName: donor.name, origin: "SYSTEM", purpose: "TRANSACTIONAL", templateName: completed ? "subscription_request_completed" : "subscription_request_received" });
}
