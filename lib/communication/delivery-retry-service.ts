import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { sendPreparedDelivery } from "./provider-router";
import { resolveTriggerSendConfig, resolveTriggerSender, type TriggerSendConfig } from "@/lib/events/dispatch";
import { resolveMetaTemplateMapping } from "./automatic-message-dispatcher";
import { buildMetaComponents } from "./providers/meta-whatsapp/parameters";
import { resolveSmsProvider } from "./providers/sms/client";
import { checkRetryRecipient, retryDefinitelyNotSent, type RetryRecipientCode } from "./retry-recipient-guard";
import {
  RETRYABLE_STATUSES, NON_RETRYABLE_TERMINAL, isCommunicationChannel,
  type CommunicationChannelId, type CommunicationProviderId,
  type CommunicationPurposeId, type DeliveryOriginId,
} from "./communication-runtime-types";

/** A retry is a new archived attempt; the historical delivery is never rewritten. */
export type RetryOutcomeCode = RetryRecipientCode
  | "SENT" | "NOT_FOUND" | "NOT_RETRYABLE_STATUS" | "NOT_RETRYABLE_BOUNCED"
  | "ALREADY_RETRIED" | "NO_RENDERED_BODY" | "META_TEMPLATE_REQUIRED"
  | "NO_SENDER_IDENTITY" | "TEMPLATE_PARAMETER_MISSING" | "TEMPLATE_HEADER_MEDIA_MISSING"
  | "ARCHIVE_FAILED" | "PROVIDER_REJECTED" | "RETRY_ORIGINAL_REQUIRED"
  | "DELIVERY_OUTCOME_UNCERTAIN" | "ACCEPTED_UNRECORDED";
export type RetryResult = {
  deliveryId: string; code: RetryOutcomeCode; ok: boolean; message: string;
  detail?: string | null; recipient?: string | null;
  recipientName?: string | null; newDeliveryId?: string | null;
};
const MESSAGES: Record<RetryOutcomeCode, string> = {
  SENT: "قبل المزوّد الرسالة؛ تُتابَع حالة التسليم في السجل",
  NOT_FOUND: "لم يُعثر على الرسالة",
  NOT_RETRYABLE_STATUS: "الرسالة ليست في حالة تسمح بإعادة الإرسال",
  NOT_RETRYABLE_BOUNCED: "العنوان مرتدّ؛ لا تُعد الإرسال إليه",
  ALREADY_RETRIED: "هذه المحاولة محجوزة أو سبق التعامل معها؛ راجع سجلها",
  NO_RECIPIENT: "لا يوجد عنوان للمستلم",
  NO_RENDERED_BODY: "لا توجد نسخة محفوظة من محتوى الرسالة",
  CONSENT_BLOCKED: "تفضيلات المستلم لا تسمح بهذه الرسالة",
  META_TEMPLATE_REQUIRED: "يتطلّب قالبًا معتمدًا من Meta",
  NO_SENDER_IDENTITY: "لا توجد هوية مُرسِل مُفعّلة",
  TEMPLATE_PARAMETER_MISSING: "القالب يطلب متغيّرًا لا توجد له قيمة محفوظة",
  TEMPLATE_HEADER_MEDIA_MISSING: "القالب يطلب صورة أو ملفًا في الترويسة ولا يوجد",
  ARCHIVE_FAILED: "تعذّر تسجيل المحاولة؛ لم يُطلب الإرسال",
  PROVIDER_REJECTED: "لم تُرسل الرسالة؛ راجع سبب الرفض",
  RECIPIENT_NOT_FOUND: "المستلم لم يعد موجودًا؛ لم تُستخدم بياناته القديمة",
  RECIPIENT_CONTACT_CHANGED: "تغيّرت وسيلة الاتصال؛ أُوقفت المحاولة للمراجعة",
  INVALID_CONTACT: "صيغة وسيلة الاتصال غير صالحة",
  RECIPIENT_CHECK_UNAVAILABLE: "تعذّر التحقق من المستلم؛ لم يُطلب الإرسال",
  RETRY_ORIGINAL_REQUIRED: "أعد المحاولة من الرسالة الأصلية، وليس من سجل محاولة فرعية",
  DELIVERY_OUTCOME_UNCERTAIN: "نتيجة المزوّد غير مؤكدة؛ راجعها قبل السماح بمحاولة جديدة",
  ACCEPTED_UNRECORDED: "قبل المزوّد الرسالة لكن تعذّر تحديث سجلها؛ لا تُعد إرسالها",
};
function result(deliveryId: string, code: RetryOutcomeCode, extra: Partial<RetryResult> = {}): RetryResult {
  return { deliveryId, code, ok: code === "SENT", message: MESSAGES[code], ...extra };
}
type DeliveryRow = {
  id: string; channel: string; status: string; origin: string; purpose: string;
  locale: string | null; templateId: string | null; templateName: string | null;
  recipientUserId: string | null; recipientEmail: string | null;
  recipientPhone: string | null; recipientName: string | null;
  renderedSubject: string | null; renderedBody: string | null; variables: unknown;
  campaignId: string | null; retriedAt: Date | null; retryOfDeliveryId: string | null;
};
const SELECT = {
  id: true, channel: true, status: true, origin: true, purpose: true, locale: true,
  templateId: true, templateName: true, recipientUserId: true, recipientEmail: true,
  recipientPhone: true, recipientName: true, renderedSubject: true, renderedBody: true,
  variables: true, campaignId: true, retriedAt: true, retryOfDeliveryId: true,
} as const;

/** Preserve the existing manual/transactional policy; campaign retries also pass their shared guard. */
async function consentBlockReason(userId: string | null, channel: CommunicationChannelId, purpose: string): Promise<string | null> {
  if (!userId) return null;
  const profile = await prisma.donorCommunicationProfile.findUnique({
    where: { userId }, select: { doNotContact: true, emailOptIn: true, whatsappOptIn: true, smsOptIn: true },
  });
  if (!profile) return channel === "WHATSAPP" ? null : (purpose === "MARKETING" ? "لا توجد موافقة مسجلة لهذا المستلم" : null);
  if (profile.doNotContact) return "المستلم مفعّل عليه عدم التواصل";
  if (purpose !== "MARKETING" || channel === "WHATSAPP") return null;
  const optedIn = channel === "EMAIL" ? profile.emailOptIn : profile.smsOptIn;
  return optedIn ? null : "رسالة تسويقية بدون موافقة على هذه القناة";
}
async function resolveRecipient(row: DeliveryRow): Promise<string | null> {
  const stored = row.channel === "EMAIL" ? row.recipientEmail : row.recipientPhone;
  if (stored) return stored;
  if (!row.recipientUserId) return null;
  const user = await prisma.user.findUnique({ where: { id: row.recipientUserId }, select: { email: true, phone: true } });
  return user ? (row.channel === "EMAIL" ? user.email : user.phone) || null : null;
}
function readPath(root: unknown, keyPath: string): unknown {
  let node: unknown = root;
  for (const key of keyPath.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" || typeof node === "number" ? node : undefined;
}
function storedTemplateValues(variables: unknown, names: string[]): Record<string, string> {
  const roots: unknown[] = [];
  if (variables && typeof variables === "object") roots.push((variables as { snapshot?: unknown }).snapshot, variables);
  const out: Record<string, string> = {};
  names.forEach((name, index) => {
    for (const root of roots) {
      const value = readPath(root, name);
      if (value == null || value === "") continue;
      out[name] = String(value);
      out[String(index + 1)] = String(value);
      break;
    }
  });
  return out;
}
async function resolveMetaTemplate(row: DeliveryRow, businessAccountId: string | null) {
  if (!row.templateId || !businessAccountId) return null;
  const tpl = await prisma.whatsappTemplate.findUnique({
    where: { id: row.templateId }, select: { id: true, provider: true, name: true, variables: true, header: true },
  });
  return tpl ? resolveMetaTemplateMapping(tpl, row.locale || "ar", businessAccountId) : null;
}

export async function retryDelivery(deliveryId: string, opts: { actorId?: string | null; config?: TriggerSendConfig } = {}): Promise<RetryResult> {
  let row: DeliveryRow | null;
  try {
    row = await prisma.communicationDelivery.findUnique({ where: { id: deliveryId }, select: SELECT });
  } catch {
    return result(deliveryId, "RECIPIENT_CHECK_UNAVAILABLE");
  }
  if (!row) return result(deliveryId, "NOT_FOUND");
  if (!isCommunicationChannel(row.channel)) return result(deliveryId, "NOT_RETRYABLE_STATUS");
  if (row.retryOfDeliveryId) return result(deliveryId, "RETRY_ORIGINAL_REQUIRED", { detail: row.retryOfDeliveryId });
  if ((NON_RETRYABLE_TERMINAL as readonly string[]).includes(row.status)) return result(deliveryId, "NOT_RETRYABLE_BOUNCED", { recipientName: row.recipientName });
  if (!(RETRYABLE_STATUSES as readonly string[]).includes(row.status)) return result(deliveryId, "NOT_RETRYABLE_STATUS", { detail: row.status });
  if (row.retriedAt) return result(deliveryId, "ALREADY_RETRIED", { recipientName: row.recipientName });
  const channel = row.channel;
  let recipient: string | null;
  try {
    recipient = await resolveRecipient(row);
    const blocked = await consentBlockReason(row.recipientUserId, channel, row.purpose);
    if (blocked) return result(deliveryId, "CONSENT_BLOCKED", { detail: blocked, recipientName: row.recipientName });
  } catch {
    return result(deliveryId, "RECIPIENT_CHECK_UNAVAILABLE", { recipientName: row.recipientName });
  }
  if (!recipient) return result(deliveryId, "NO_RECIPIENT", { recipientName: row.recipientName });
  const precheck = await checkRetryRecipient(row);
  if (!precheck.ok) return result(deliveryId, precheck.code, { recipientName: row.recipientName });
  recipient = precheck.contact;
  const base = { recipient, recipientName: row.recipientName };
  const config = opts.config ?? await resolveTriggerSendConfig();
  let payload: Parameters<typeof sendPreparedDelivery>[0];
  let provider: CommunicationProviderId;
  let senderId: string | null = null;
  if (channel === "EMAIL") {
    if (!row.renderedBody) return result(deliveryId, "NO_RENDERED_BODY", base);
    const routed = resolveTriggerSender(config, "EMAIL", { locale: row.locale, purpose: row.purpose as never });
    if (!routed.ok) return result(deliveryId, "NO_SENDER_IDENTITY", { ...base, detail: routed.reason });
    provider = "ELASTIC_EMAIL";
    senderId = routed.sender.id;
    payload = { channel, sender: { senderEmail: routed.sender.senderEmail }, to: recipient, subject: row.renderedSubject ?? "", html: row.renderedBody };
  } else if (channel === "WHATSAPP") {
    const routed = resolveTriggerSender(config, "WHATSAPP", { locale: row.locale, purpose: row.purpose as never });
    if (!routed.ok) return result(deliveryId, "NO_SENDER_IDENTITY", { ...base, detail: routed.reason });
    if (!routed.sender.phoneNumberId || !routed.sender.businessAccountId) return result(deliveryId, "NO_SENDER_IDENTITY", base);
    const meta = await resolveMetaTemplate(row, routed.sender.businessAccountId);
    if (!meta) return result(deliveryId, "META_TEMPLATE_REQUIRED", base);
    const built = buildMetaComponents({
      componentsSchema: meta.componentsSchema, values: storedTemplateValues(row.variables, meta.positionalNames),
      positionalNames: meta.positionalNames, scopedNames: meta.scopedNames,
      headerMediaUrl: meta.headerMediaUrl, headerMediaFilename: meta.headerMediaFilename, headerLocation: meta.headerLocation,
    });
    if (!built.ok) return result(deliveryId, built.reason as RetryOutcomeCode, { ...base, detail: built.detail });
    provider = "META_WHATSAPP";
    senderId = routed.sender.id;
    payload = { channel, sender: { provider, phoneNumberId: routed.sender.phoneNumberId }, to: recipient, templateName: meta.name, languageCode: meta.language, components: built.components };
  } else {
    if (!row.renderedBody) return result(deliveryId, "NO_RENDERED_BODY", base);
    const route = await resolveSmsProvider(null, recipient);
    provider = route.provider;
    payload = { channel, to: recipient, html: row.renderedBody };
  }
  // Omitting these fields made marketing retries use transactional transport.
  payload.purpose = row.purpose as CommunicationPurposeId;
  payload.locale = row.locale;

  const claimedAt = new Date();
  const claim = await prisma.communicationDelivery.updateMany({
    where: { id: deliveryId, status: row.status, OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }] },
    data: { retriedAt: claimedAt },
  });
  if (claim.count === 0) return result(deliveryId, "ALREADY_RETRIED", base);
  // Only this attempt may release its claim, and only before a proven send.
  const releaseClaim = async () => {
    await prisma.communicationDelivery.updateMany({ where: { id: deliveryId, retriedAt: claimedAt }, data: { retriedAt: null } });
  };
  const created = await createDeliveryRecord({
    channel, provider, senderId, campaignId: row.campaignId, templateId: row.templateId,
    templateName: row.templateName, recipientUserId: row.recipientUserId,
    recipientEmail: channel === "EMAIL" ? recipient : null, recipientPhone: channel === "EMAIL" ? null : recipient,
    recipientName: row.recipientName, locale: row.locale, purpose: row.purpose as CommunicationPurposeId,
    origin: row.origin as DeliveryOriginId, renderedSubject: row.renderedSubject, renderedBody: row.renderedBody,
    variables: (row.variables ?? undefined) as Record<string, unknown> | undefined,
    createdBy: opts.actorId ?? null, status: "RENDERED",
  });
  if (!created.ok) {
    await releaseClaim();
    return result(deliveryId, "ARCHIVE_FAILED", { ...base, detail: created.error });
  }
  const newId = created.data.id;
  try {
    // The link is mandatory before any provider call: child rows cannot create
    // independent retries that race the original message's retry claim.
    await prisma.communicationDelivery.update({ where: { id: newId }, data: { retryOfDeliveryId: deliveryId } });
  } catch {
    await markDeliveryStatus(newId, "CANCELLED", { errorMessage: "RETRY_LINK_FAILED" });
    await releaseClaim();
    return result(deliveryId, "ARCHIVE_FAILED", { ...base, newDeliveryId: newId });
  }
  const live = await checkRetryRecipient(row, recipient);
  if (!live.ok) {
    await markDeliveryStatus(newId, live.code === "CONSENT_BLOCKED" ? "SKIPPED" : "FAILED", { errorMessage: live.code });
    await releaseClaim();
    return result(deliveryId, live.code, { ...base, newDeliveryId: newId });
  }
  payload.to = live.contact;
  let response: Awaited<ReturnType<typeof sendPreparedDelivery>>;
  try {
    response = await sendPreparedDelivery(payload);
  } catch {
    // A socket failure can happen AFTER acceptance. Hold the claim; never
    // silently turn an unknown outcome into permission to send a duplicate.
    await markDeliveryStatus(newId, "FAILED", { errorMessage: "DELIVERY_OUTCOME_UNCERTAIN" });
    return result(deliveryId, "DELIVERY_OUTCOME_UNCERTAIN", { ...base, newDeliveryId: newId });
  }
  if (!response.ok) {
    const detail = response.detail ? `${response.reason}  ${response.detail}` : response.reason;
    const knownUnsent = retryDefinitelyNotSent(response.reason);
    await markDeliveryStatus(newId, "FAILED", { errorMessage: knownUnsent ? detail : `DELIVERY_OUTCOME_UNCERTAIN: ${detail}` });
    if (knownUnsent) await releaseClaim();
    return result(deliveryId, knownUnsent ? "PROVIDER_REJECTED" : "DELIVERY_OUTCOME_UNCERTAIN", { ...base, detail, newDeliveryId: newId });
  }
  const archived = await markDeliveryStatus(newId, "SENT", { providerMessageId: response.providerMessageId, internalAccepted: response.internalAccepted });
  if (!archived.ok) return result(deliveryId, "ACCEPTED_UNRECORDED", { ...base, newDeliveryId: newId });
  return result(deliveryId, "SENT", { ...base, newDeliveryId: newId });
}

export const RETRY_BATCH_CAP = 25;
export type RetryCandidateFilter = { channel: CommunicationChannelId; from?: Date; to?: Date; ids?: string[] };
const rootDelivery = { OR: [{ retryOfDeliveryId: null }, { retryOfDeliveryId: { isSet: false } }] };
function retryScope(filter: RetryCandidateFilter) {
  return {
    channel: filter.channel,
    ...(filter.ids !== undefined ? { id: { in: [...new Set(filter.ids)] } } : {}),
    ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    AND: [rootDelivery],
  };
}
export async function listRetryCandidates(filter: RetryCandidateFilter, take = RETRY_BATCH_CAP): Promise<string[]> {
  const limit = Number.isFinite(take) ? Math.max(1, Math.min(RETRY_BATCH_CAP, Math.floor(take))) : RETRY_BATCH_CAP;
  const rows = await prisma.communicationDelivery.findMany({
    where: { ...retryScope(filter), status: { in: [...RETRYABLE_STATUSES] }, OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true },
  });
  return rows.map((record) => record.id);
}
export type RetryPreflight = {
  eligible: number; alreadyRetried: number; bounced: number; cap: number;
  oldestDays: number | null; byReason: Array<{ reason: string; count: number }>;
};
export async function retryPreflight(filter: RetryCandidateFilter): Promise<RetryPreflight> {
  const scope = retryScope(filter);
  const [eligibleRows, alreadyRetried, bounced] = await Promise.all([
    prisma.communicationDelivery.findMany({
      where: { ...scope, status: { in: [...RETRYABLE_STATUSES] }, OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }] },
      select: { errorMessage: true, createdAt: true }, orderBy: { createdAt: "asc" },
    }),
    prisma.communicationDelivery.count({ where: { ...scope, status: { in: [...RETRYABLE_STATUSES] }, retriedAt: { not: null } } }),
    prisma.communicationDelivery.count({ where: { ...scope, status: { in: [...NON_RETRYABLE_TERMINAL] } } }),
  ]);
  const counts = new Map<string, number>();
  for (const record of eligibleRows) {
    const reason = (record.errorMessage || "غير محدّد").split("  ")[0];
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const oldest = eligibleRows[0]?.createdAt ?? null;
  return {
    eligible: eligibleRows.length, alreadyRetried, bounced, cap: RETRY_BATCH_CAP,
    oldestDays: oldest ? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86_400_000)) : null,
    byReason: [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
