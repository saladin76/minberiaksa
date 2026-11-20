import "server-only";

import { prisma } from "@/lib/prisma";
import { createDeliveryRecord, markDeliveryStatus } from "./delivery-log-service";
import { parseConversationId } from "./conversation-service";
import { phoneMatchVariants, normalizePhoneE164 } from "./phone";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";
import { sendPreparedDelivery } from "./provider-router";

/**
 * Sending an approved template from a conversation (owner, 2026-11-20): after WhatsApp's 24-hour window
 * only an approved template may start the conversation again. Same safeguards as a reply (do-not-contact,
 * the conversation's own number), same template machinery as the automatic messages (the approved
 * language version in that number's account, variables filled from the schema Meta approved). A template
 * that needs data a conversation does not have (a donation's details, for instance) is refused, not guessed.
 */
export type ConversationTemplateResult =
  | { ok: true; deliveryId: string; providerMessageId: string | null }
  | { ok: false; reason: string; detail?: string | null };

type SenderRow = { id: string; phoneNumberId?: string | null; enabled?: boolean; status?: string; channel?: string } & Record<string, unknown>;
type TemplateRow = { id: string; provider: string | null; name: string | null; body: string | null; variables: unknown; header: unknown; translations: unknown };

async function conversationSender(conversationId: string): Promise<{ ok: true; to: string; senderId: string | null; resolvedSenderId: string | null; phoneNumberId: string; businessAccountId: string | null } | { ok: false; reason: string }> {
  const { senderId, phone } = parseConversationId(conversationId);
  const to = normalizePhoneE164(phone);
  if (!to) return { ok: false, reason: "INVALID_RECIPIENT" };
  let policyUnavailable = false;
  const blocked = await prisma.donorCommunicationProfile
    .findFirst({ where: { phone: { in: phoneMatchVariants(to) }, doNotContact: true }, select: { id: true } })
    .catch(() => { policyUnavailable = true; return null; });
  if (policyUnavailable) return { ok: false, reason: "CONTACT_POLICY_UNAVAILABLE" };
  if (blocked) return { ok: false, reason: "DO_NOT_CONTACT" };
  const snapshot = await loadSenderRoutingSnapshot("WHATSAPP");
  const known = (senderId ? snapshot.raw.get(senderId) : null) as SenderRow | null | undefined;
  if (senderId && !known) return { ok: false, reason: "CONVERSATION_SENDER_NOT_FOUND" };
  if (known && (!known.enabled || known.status !== "ACTIVE" || known.channel !== "WHATSAPP")) return { ok: false, reason: "CONVERSATION_SENDER_UNAVAILABLE" };
  let resolvedSenderId: string | null = known?.id ?? null;
  let phoneNumberId: string | null = known?.phoneNumberId ?? null;
  let account: SenderRow | null = known ?? null;
  if (!known) {
    const routed = resolveSenderFromSnapshot(snapshot, { purpose: "UTILITY" });
    if (!routed.ok) return { ok: false, reason: routed.reason };
    resolvedSenderId = routed.sender.id;
    phoneNumberId = routed.sender.phoneNumberId;
    account = routed.sender as unknown as SenderRow;
  }
  if (!phoneNumberId) return { ok: false, reason: "META_SENDER_MISSING_PHONE_NUMBER_ID" };
  const waba = account?.businessAccountId ?? account?.wabaId ?? null;
  return { ok: true, to, senderId, resolvedSenderId, phoneNumberId, businessAccountId: typeof waba === "string" && waba ? waba : null };
}

/** STOP on WhatsApp: the same explicit unsubscribe the campaigns honour (consentSource "meta-whatsapp-inbound-opt-out"). */
async function marketingOptedOut(to: string): Promise<boolean> {
  const { isWhatsappExplicitlyUnsubscribed } = await import("./campaign-audience-accounting");
  const rows = await prisma.donorCommunicationProfile
    .findMany({ where: { phone: { in: phoneMatchVariants(to) } }, select: { consentSource: true }, take: 5 })
    .catch(() => null);
  if (rows === null) return true; // an unreadable profile counts as opted out
  return rows.some((row) => isWhatsappExplicitlyUnsubscribed(row));
}

function localizedBody(tpl: TemplateRow, locale: string | null | undefined): string {
  const t = tpl.translations && typeof tpl.translations === "object" ? (tpl.translations as Record<string, { body?: unknown }>)[locale ?? ""] : undefined;
  return String((typeof t?.body === "string" && t.body.trim() ? t.body : tpl.body) ?? "");
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, key: string) => values[key] ?? m);

/** Approved templates this conversation's number can send, in the conversation's language first. */
export async function conversationTemplates(conversationId: string, locale: string, name: string | null): Promise<{ ok: true; templates: Array<{ id: string; name: string; language: string; preview: string }> } | { ok: false; reason: string }> {
  const sender = await conversationSender(conversationId);
  if (!sender.ok) return sender;
  const { resolveMetaTemplateMapping } = await import("./automatic-message-dispatcher");
  const rows = (await prisma.whatsappTemplate.findMany({ select: { id: true, provider: true, name: true, body: true, variables: true, header: true, translations: true }, take: 200 })) as unknown as TemplateRow[];
  const values = { "user.name": name?.trim() || "", "user.phone": sender.to };
  const optedOut = await marketingOptedOut(sender.to);
  const out: Array<{ id: string; name: string; language: string; preview: string }> = [];
  for (const tpl of rows) {
    const mapping = await resolveMetaTemplateMapping(tpl, locale, sender.businessAccountId).catch(() => null);
    if (!mapping) continue;
    if (mapping.category === "MARKETING" && optedOut) continue;
    out.push({ id: tpl.id, name: String(tpl.name ?? mapping.name), language: mapping.language, preview: fill(localizedBody(tpl, mapping.resolvedLocale), values).slice(0, 600) });
  }
  out.sort((a, b) => Number(!a.language.startsWith(locale)) - Number(!b.language.startsWith(locale)) || a.name.localeCompare(b.name));
  return { ok: true, templates: out };
}

export async function sendConversationTemplate(conversationId: string, templateId: string, locale: string, name: string | null, actor?: { actorId?: string | null } | null): Promise<ConversationTemplateResult> {
  if (!/^[a-f0-9]{24}$/i.test(templateId)) return { ok: false, reason: "INVALID_TEMPLATE" };
  const sender = await conversationSender(conversationId);
  if (!sender.ok) return sender;
  const tpl = (await prisma.whatsappTemplate.findUnique({ where: { id: templateId }, select: { id: true, provider: true, name: true, body: true, variables: true, header: true, translations: true } })) as unknown as TemplateRow | null;
  if (!tpl) return { ok: false, reason: "TEMPLATE_NOT_FOUND" };
  const { resolveMetaTemplateMapping } = await import("./automatic-message-dispatcher");
  const mapping = await resolveMetaTemplateMapping(tpl, locale, sender.businessAccountId);
  if (!mapping) return { ok: false, reason: "TEMPLATE_NOT_APPROVED" };
  /* A donor who pressed STOP has whatsappOptIn=false: no marketing template, ever; service templates stay allowed. */
  if (mapping.category === "MARKETING" && await marketingOptedOut(sender.to)) return { ok: false, reason: "MARKETING_OPTED_OUT" };
  const values = { "user.name": name?.trim() || "", "user.phone": sender.to };
  const { buildMetaComponents } = await import("./providers/meta-whatsapp/parameters");
  const built = buildMetaComponents({
    componentsSchema: mapping.componentsSchema, values, positionalNames: mapping.positionalNames, scopedNames: mapping.scopedNames,
    headerMediaUrl: mapping.headerMediaUrl, headerMediaFilename: mapping.headerMediaFilename, headerLocation: mapping.headerLocation,
  });
  if (!built.ok) return { ok: false, reason: "TEMPLATE_NEEDS_DATA", detail: built.detail ?? null };
  const renderedBody = fill(localizedBody(tpl, mapping.resolvedLocale), values);
  const created = await createDeliveryRecord({
    channel: "WHATSAPP", provider: "META_WHATSAPP", origin: "MANUAL", purpose: mapping.category === "MARKETING" ? "MARKETING" : "UTILITY",
    recipientPhone: sender.to, renderedBody, templateName: mapping.name, templateId: tpl.id, senderId: sender.resolvedSenderId,
    createdBy: actor?.actorId ?? null, status: "RENDERED",
  } as unknown as Parameters<typeof createDeliveryRecord>[0]);
  if (!created.ok) return { ok: false, reason: "ARCHIVE_FAILED" };
  const res = await sendPreparedDelivery({
    channel: "WHATSAPP", sender: { provider: "META_WHATSAPP", phoneNumberId: sender.phoneNumberId }, to: sender.to,
    templateName: mapping.name, languageCode: mapping.language, components: built.components,
  });
  if (!res.ok) {
    await markDeliveryStatus(created.data.id, "FAILED", { errorMessage: res.detail ? `${res.reason} — ${res.detail}` : res.reason });
    return { ok: false, reason: res.reason, detail: res.detail ?? null };
  }
  const archived = await markDeliveryStatus(created.data.id, "SENT", { providerMessageId: res.providerMessageId });
  if (!archived.ok) return { ok: false, reason: "ACCEPTED_UNRECORDED" };
  void import("./inbox-conversations")
    .then((m) => m.touchOutbound({ senderId: sender.senderId, phone: sender.to, text: renderedBody, at: new Date() }))
    .catch(() => undefined);
  return { ok: true, deliveryId: created.data.id, providerMessageId: res.providerMessageId };
}
