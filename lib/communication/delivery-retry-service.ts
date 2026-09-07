import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { sendPreparedDelivery } from "./provider-router";
import { resolveTriggerSendConfig, type TriggerSendConfig } from "@/lib/events/dispatch";
import { resolveMetaTemplateMapping } from "./automatic-message-dispatcher";
import { resolveSmsProvider } from "./providers/sms/client";
import {
  RETRYABLE_STATUSES,
  NON_RETRYABLE_TERMINAL,
  type CommunicationChannelId,
  type CommunicationProviderId,
  type CommunicationPurposeId,
  type DeliveryOriginId,
} from "./communication-runtime-types";

/**
 * Re-sending a delivery that never made it out.
 *
 * The backlog this exists for is real: messages skipped during an era when no email provider was
 * configured, and failures from a provider outage. Those are genuinely re-sendable — the reason they
 * failed is fixed. But the same button pointed at the wrong row double-charges a donor's inbox, so
 * every guard below exists to answer one question: *would sending this again be correct?*
 *
 * Three rules shape the design:
 *
 *  1. A retry is a NEW delivery row, never an edit of the old one. The original failure is evidence;
 *     rewriting it in place would silently restate historical failure-rate figures, and the roadmap's
 *     first rule is that we never quietly recompute recorded numbers.
 *  2. `retriedAt` is stamped on the original only once the provider ACCEPTS the retry. A retry that
 *     fails leaves the original re-tryable — but a successful one can never be sent twice.
 *  3. Nothing is re-sent from the stored snapshot alone. Consent, the recipient address and (for
 *     WhatsApp) the template approval are all re-checked against today's state, because all three
 *     can have changed since the row was written — that change is usually the whole reason a retry
 *     is being attempted.
 */

/** Terminal outcome codes. Everything except SENT means no message left the building. */
export type RetryOutcomeCode =
  | "SENT"
  | "NOT_FOUND"
  | "NOT_RETRYABLE_STATUS"
  | "NOT_RETRYABLE_BOUNCED"
  | "ALREADY_RETRIED"
  | "NO_RECIPIENT"
  | "NO_RENDERED_BODY"
  | "CONSENT_BLOCKED"
  | "META_TEMPLATE_REQUIRED"
  | "NO_SENDER_IDENTITY"
  | "ARCHIVE_FAILED"
  | "PROVIDER_REJECTED";

export type RetryResult = {
  deliveryId: string;
  code: RetryOutcomeCode;
  ok: boolean;
  /** Arabic, reader-facing. Says what happened, not what the code was. */
  message: string;
  /** Raw provider/technical detail, when there is one worth keeping. */
  detail?: string | null;
  recipient?: string | null;
  recipientName?: string | null;
  newDeliveryId?: string | null;
};

const MESSAGES: Record<RetryOutcomeCode, string> = {
  SENT: "أُرسلت بنجاح",
  NOT_FOUND: "لم يُعثر على الرسالة",
  NOT_RETRYABLE_STATUS: "الرسالة ليست في حالة تسمح بإعادة الإرسال",
  NOT_RETRYABLE_BOUNCED: "العنوان مرتدّ — إعادة الإرسال إليه تضرّ بسمعة النطاق",
  ALREADY_RETRIED: "أُعيد إرسالها من قبل",
  NO_RECIPIENT: "لا يوجد عنوان للمستلم",
  NO_RENDERED_BODY: "لا توجد نسخة محفوظة من محتوى الرسالة",
  CONSENT_BLOCKED: "المستلم غير موافق على التواصل",
  META_TEMPLATE_REQUIRED: "يتطلّب قالبًا معتمدًا من Meta",
  NO_SENDER_IDENTITY: "لا توجد هوية مُرسِل مُفعّلة",
  ARCHIVE_FAILED: "تعذّر تسجيل المحاولة",
  PROVIDER_REJECTED: "رفضها المزوّد",
};

function result(deliveryId: string, code: RetryOutcomeCode, extra: Partial<RetryResult> = {}): RetryResult {
  return { deliveryId, code, ok: code === "SENT", message: MESSAGES[code], ...extra };
}

type DeliveryRow = {
  id: string;
  channel: string;
  status: string;
  origin: string;
  purpose: string;
  locale: string | null;
  templateId: string | null;
  templateName: string | null;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  variables: unknown;
  campaignId: string | null;
  retriedAt: Date | null;
};

const SELECT = {
  id: true, channel: true, status: true, origin: true, purpose: true, locale: true,
  templateId: true, templateName: true, recipientUserId: true, recipientEmail: true,
  recipientPhone: true, recipientName: true, renderedSubject: true, renderedBody: true,
  variables: true, campaignId: true, retriedAt: true,
} as const;

/**
 * Consent, re-evaluated now rather than trusted from the original send.
 *
 * `contactChannelEligibility` treats a missing preference row as ineligible, which is right for a
 * marketing campaign choosing whom to approach. It is wrong here: most donors have no profile row at
 * all, and a transactional receipt they were always entitled to would be blocked for everyone. So
 * transactional retries are gated on an explicit `doNotContact` only, while marketing retries — the
 * ones that genuinely require permission — still demand a recorded opt-in on that channel.
 */
async function consentBlockReason(
  userId: string | null,
  channel: CommunicationChannelId,
  purpose: string,
): Promise<string | null> {
  if (!userId) return null;
  const profile = await prisma.donorCommunicationProfile
    .findUnique({
      where: { userId },
      select: { doNotContact: true, emailOptIn: true, whatsappOptIn: true, smsOptIn: true },
    })
    .catch(() => null);
  if (!profile) return purpose === "MARKETING" ? "لا توجد موافقة مسجّلة لهذا المستلم" : null;
  if (profile.doNotContact) return "المستلم مفعّل عليه «عدم التواصل»";
  if (purpose !== "MARKETING") return null;
  const optedIn =
    channel === "EMAIL" ? profile.emailOptIn : channel === "WHATSAPP" ? profile.whatsappOptIn : profile.smsOptIn;
  return optedIn ? null : "رسالة تسويقية بدون موافقة على هذه القناة";
}

/**
 * The address to send to now — not necessarily the one on the row.
 *
 * A delivery skipped with NO_RECIPIENT_EMAIL stored a null address. If that donor has since added
 * one, re-reading the user record is precisely what makes the retry worth attempting; falling back
 * to the frozen snapshot would guarantee it skips again for the same reason.
 */
async function resolveRecipient(row: DeliveryRow): Promise<string | null> {
  const stored = row.channel === "EMAIL" ? row.recipientEmail : row.recipientPhone;
  if (stored) return stored;
  if (!row.recipientUserId) return null;
  const user = await prisma.user
    .findUnique({ where: { id: row.recipientUserId }, select: { email: true, phone: true } })
    .catch(() => null);
  if (!user) return null;
  return (row.channel === "EMAIL" ? user.email : user.phone) || null;
}

/** Re-check the stored template against Meta's *current* approval state. */
async function resolveMetaTemplate(row: DeliveryRow): Promise<{ name: string; language: string } | null> {
  if (!row.templateId) return null;
  const tpl = await prisma.whatsappTemplate
    .findUnique({
      where: { id: row.templateId },
      select: { provider: true, approvalStatus: true, language: true, externalTemplateId: true, name: true },
    })
    .catch(() => null);
  if (!tpl) return null;
  return resolveMetaTemplateMapping(tpl, row.locale || "ar");
}

/**
 * Retry one delivery. Safe to call concurrently for different ids; a single id is protected from
 * double-sending by the conditional `retriedAt` claim below.
 */
export async function retryDelivery(
  deliveryId: string,
  opts: { actorId?: string | null; config?: TriggerSendConfig } = {},
): Promise<RetryResult> {
  const row = (await prisma.communicationDelivery
    .findUnique({ where: { id: deliveryId }, select: SELECT })
    .catch(() => null)) as DeliveryRow | null;

  if (!row) return result(deliveryId, "NOT_FOUND");
  if ((NON_RETRYABLE_TERMINAL as readonly string[]).includes(row.status)) {
    return result(deliveryId, "NOT_RETRYABLE_BOUNCED", { recipient: row.recipientEmail ?? row.recipientPhone, recipientName: row.recipientName });
  }
  if (!(RETRYABLE_STATUSES as readonly string[]).includes(row.status)) {
    return result(deliveryId, "NOT_RETRYABLE_STATUS", { detail: row.status, recipientName: row.recipientName });
  }
  if (row.retriedAt) {
    return result(deliveryId, "ALREADY_RETRIED", { recipient: row.recipientEmail ?? row.recipientPhone, recipientName: row.recipientName });
  }

  const channel = row.channel as CommunicationChannelId;
  const recipient = await resolveRecipient(row);
  const base = { recipient, recipientName: row.recipientName };

  if (!recipient) return result(deliveryId, "NO_RECIPIENT", base);

  const blocked = await consentBlockReason(row.recipientUserId, channel, row.purpose);
  if (blocked) return result(deliveryId, "CONSENT_BLOCKED", { ...base, detail: blocked });

  const config = opts.config ?? (await resolveTriggerSendConfig());

  // Resolve the channel payload BEFORE writing an attempt row, so a message that cannot be built
  // leaves no misleading extra "failed" delivery behind.
  let payload: Parameters<typeof sendPreparedDelivery>[0];
  let provider: CommunicationProviderId;
  let senderId: string | null = null;

  if (channel === "EMAIL") {
    if (!row.renderedBody) return result(deliveryId, "NO_RENDERED_BODY", base);
    if (!config.emailIdentity) return result(deliveryId, "NO_SENDER_IDENTITY", base);
    provider = "ELASTIC_EMAIL";
    payload = {
      channel: "EMAIL",
      sender: { senderEmail: config.emailIdentity },
      to: recipient,
      subject: row.renderedSubject ?? "",
      html: row.renderedBody,
    };
  } else if (channel === "WHATSAPP") {
    const meta = await resolveMetaTemplate(row);
    // Meta refuses business-initiated free text, so the stored body is not a fallback here: without
    // a currently-approved template there is no legal payload to send at all.
    if (!meta) return result(deliveryId, "META_TEMPLATE_REQUIRED", base);
    if (!config.whatsappSender?.phoneNumberId) return result(deliveryId, "NO_SENDER_IDENTITY", base);
    provider = "META_WHATSAPP";
    senderId = config.whatsappSender.id;
    payload = {
      channel: "WHATSAPP",
      sender: { provider: "META_WHATSAPP", phoneNumberId: config.whatsappSender.phoneNumberId },
      to: recipient,
      templateName: meta.name,
      languageCode: meta.language,
    };
  } else if (channel === "SMS") {
    if (!row.renderedBody) return result(deliveryId, "NO_RENDERED_BODY", base);
    // No sender-identity gate here, unlike the other two: the SMS "from" is part of each provider's
    // own config (Netgsm header / Brevo sender), not a CommunicationSender row. Which carrier gets
    // the message is decided from the destination number, so it is resolved per recipient rather
    // than once for the batch — and re-resolved now, since a route unconfigured at the original
    // send may have been set up since.
    const route = await resolveSmsProvider(null, recipient);
    provider = route.provider;
    payload = { channel: "SMS", to: recipient, html: row.renderedBody };
  } else {
    return result(deliveryId, "NOT_RETRYABLE_STATUS", { ...base, detail: `channel ${row.channel}` });
  }

  /**
   * Claim the original before calling the provider, not after.
   *
   * Two admins on the same row — or one impatient double-click — would otherwise both read
   * `retriedAt: null`, both send, and the donor gets the message twice. `updateMany` with the null
   * guard in the WHERE clause makes the claim atomic: exactly one caller sees count === 1.
   *
   * The Mongo connector distinguishes an explicit null from an absent field, and every row written
   * before this feature has the field absent — so the guard must accept both or it would match
   * nothing and every retry would look like a lost race.
   */
  const claim = await prisma.communicationDelivery.updateMany({
    where: {
      id: deliveryId,
      OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }],
    },
    data: { retriedAt: new Date() },
  });
  if (claim.count === 0) return result(deliveryId, "ALREADY_RETRIED", base);

  /** Undo the claim so a retry that never reached the provider can be attempted again. */
  const releaseClaim = async () => {
    await prisma.communicationDelivery
      .update({ where: { id: deliveryId }, data: { retriedAt: null } })
      .catch(() => null);
  };

  const created = await createDeliveryRecord({
    channel,
    provider,
    senderId,
    campaignId: row.campaignId,
    templateId: row.templateId,
    templateName: row.templateName,
    recipientUserId: row.recipientUserId,
    recipientEmail: channel === "EMAIL" ? recipient : null,
    recipientPhone: channel === "EMAIL" ? null : recipient,
    recipientName: row.recipientName,
    locale: row.locale,
    purpose: row.purpose as CommunicationPurposeId,
    origin: row.origin as DeliveryOriginId,
    renderedSubject: row.renderedSubject,
    renderedBody: row.renderedBody,
    variables: (row.variables ?? undefined) as Record<string, unknown> | undefined,
    createdBy: opts.actorId ?? null,
    status: "RENDERED",
  });
  if (!created.ok) {
    await releaseClaim();
    return result(deliveryId, "ARCHIVE_FAILED", { ...base, detail: created.error });
  }
  const newId = created.data.id;
  await prisma.communicationDelivery
    .update({ where: { id: newId }, data: { retryOfDeliveryId: deliveryId } })
    .catch(() => null);

  // A thrown send (DNS, socket reset) must not strand the claim: without this the original would
  // stay marked as retried while nothing was ever delivered, making it permanently un-retryable.
  let res: Awaited<ReturnType<typeof sendPreparedDelivery>>;
  try {
    res = await sendPreparedDelivery(payload);
  } catch (error) {
    const detail = (error as Error).message;
    await markDeliveryStatus(newId, "FAILED", { errorMessage: `SEND_THREW — ${detail}` });
    await releaseClaim();
    return result(deliveryId, "PROVIDER_REJECTED", { ...base, detail, newDeliveryId: newId });
  }

  if (!res.ok) {
    const detail = res.detail ? `${res.reason} — ${res.detail}` : res.reason;
    await markDeliveryStatus(newId, "FAILED", { errorMessage: detail });
    // The message did not go out, so the original is not "retried" — releasing the claim lets an
    // admin try again once whatever the provider objected to has been fixed.
    await releaseClaim();
    return result(deliveryId, "PROVIDER_REJECTED", { ...base, detail, newDeliveryId: newId });
  }

  await markDeliveryStatus(newId, "SENT", {
    providerMessageId: res.providerMessageId,
    internalAccepted: res.internalAccepted,
  });
  return result(deliveryId, "SENT", { ...base, newDeliveryId: newId });
}

/** How many messages one click may send. A mistake should be recoverable, not a mass mailing. */
export const RETRY_BATCH_CAP = 25;

export type RetryCandidateFilter = {
  channel: CommunicationChannelId;
  from?: Date;
  to?: Date;
  ids?: string[];
};

/**
 * Candidate ids for a bulk retry, oldest first.
 *
 * Oldest-first is deliberate: a backlog is cleared from the bottom, and it also means the messages
 * an operator sees in the first batch are the ones whose age matters most.
 */
export async function listRetryCandidates(filter: RetryCandidateFilter, take = RETRY_BATCH_CAP): Promise<string[]> {
  if (filter.ids?.length) return filter.ids.slice(0, take);
  const rows = await prisma.communicationDelivery.findMany({
    where: {
      channel: filter.channel,
      status: { in: [...RETRYABLE_STATUSES] },
      OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }],
      ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type RetryPreflight = {
  eligible: number;
  alreadyRetried: number;
  bounced: number;
  cap: number;
  /** Age of the oldest re-sendable message, in days. Drives the staleness warning. */
  oldestDays: number | null;
  byReason: Array<{ reason: string; count: number }>;
};

/**
 * What a bulk retry *would* do, so the confirmation can state it rather than imply it.
 *
 * `oldestDays` matters more than it looks: these are mostly transactional receipts, and delivering a
 * three-month-old donation receipt today reads to the donor as a new charge. An operator deserves to
 * know that before clicking, not after.
 */
export async function retryPreflight(filter: RetryCandidateFilter): Promise<RetryPreflight> {
  const range = filter.from || filter.to
    ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
    : {};
  const pending = { OR: [{ retriedAt: null }, { retriedAt: { isSet: false } }] };

  const [eligibleRows, alreadyRetried, bounced] = await Promise.all([
    prisma.communicationDelivery.findMany({
      where: { channel: filter.channel, status: { in: [...RETRYABLE_STATUSES] }, ...pending, ...range },
      select: { errorMessage: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.communicationDelivery.count({
      where: { channel: filter.channel, status: { in: [...RETRYABLE_STATUSES] }, retriedAt: { not: null }, ...range },
    }),
    prisma.communicationDelivery.count({
      where: { channel: filter.channel, status: { in: [...NON_RETRYABLE_TERMINAL] }, ...range },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of eligibleRows) {
    const reason = (row.errorMessage || "غير محدّد").split(" — ")[0];
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  const oldest = eligibleRows[0]?.createdAt ?? null;
  return {
    eligible: eligibleRows.length,
    alreadyRetried,
    bounced,
    cap: RETRY_BATCH_CAP,
    oldestDays: oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : null,
    byReason: [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
