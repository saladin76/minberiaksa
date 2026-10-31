import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { SUPPORTED_LOCALES } from "../locales";
import { writeAuditLog } from "../audit-log";
import { isDonationMoneyNotificationEvent } from "../templates/donation-money";
import { approvedNotificationLocales, notificationTemplateHash, notificationUpgradeDraft, type NotificationTemplateSource } from "./notification-template-upgrade";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown) => value as Prisma.InputJsonValue;
const defaults = { channel: "WHATSAPP", provider: "META_WHATSAPP", isDefault: true };

/** Reads the actual installed templates; missing translations are reported, never
 * fabricated. Applying only creates drafts; it cannot send to a donor. */
export async function prepareNotificationUpgrades(opts: { apply?: boolean; publish?: boolean } = {}) {
  if (opts.publish && !opts.apply) throw new Error("Publishing requires apply");
  const senders = await prisma.communicationSender.findMany({ where: defaults });
  if (senders.length !== 1 || !senders[0].enabled || senders[0].status !== "ACTIVE" || !senders[0].businessAccountId) throw new Error("ONE_ACTIVE_DEFAULT_WHATSAPP_SENDER_REQUIRED");
  const triggers = await prisma.messageTrigger.findMany({ where: { channel: "WHATSAPP", enabled: true } });
  const sources = await prisma.whatsappTemplate.findMany({ where: { id: { in: [...new Set(triggers.map(row => row.templateId))] } } });
  const results: Array<{ source: string; template?: string; state: string; reason?: string; errors?: Array<{ language: string; reason: string; detail?: string }> }> = [];
  for (const source of sources) {
    try {
      const events = triggers.filter(row => row.templateId === source.id).map(row => row.event);
      const welcomeMarketing = events.includes("USER_REGISTERED");
      const sourceVersion = Number(object(source.notificationUpgrade).version);
      if (sourceVersion === 3 || sourceVersion === 2 && !welcomeMarketing) continue;
      const moneyEvents = events.filter(isDonationMoneyNotificationEvent);
      if (moneyEvents.length && moneyEvents.length !== events.length) throw new Error("MIXED_RECEIPT_AND_FUTURE_PAYMENT_TRIGGERS_REQUIRE_REVIEW");
      const receipt = moneyEvents.length > 0;
      if (welcomeMarketing && events.some(event => event !== "USER_REGISTERED")) throw new Error("MIXED_WELCOME_AND_TRANSACTIONAL_TRIGGERS_REQUIRE_REVIEW");
      const draft = notificationUpgradeDraft(source, receipt, welcomeMarketing);
      let candidate = await prisma.whatsappTemplate.findFirst({ where: { name: draft.name } });
      const data = { name: draft.name, body: draft.body, translations: json(draft.translations), header: json(draft.header), footerText: draft.footerText, buttons: json(draft.buttons),
        provider: "META_WHATSAPP", channel: "WHATSAPP", kind: "SYSTEM", category: draft.category ?? source.category ?? "UTILITY", purpose: draft.purpose ?? source.purpose ?? "UTILITY" };
      const draftHash = notificationTemplateHash({ id: "", ...data });
      if (candidate && (object(candidate.notificationUpgrade).sourceId !== source.id || notificationTemplateHash(candidate) !== draftHash)) throw new Error("EXISTING_UPGRADE_HAS_EDITORIAL_CHANGES");
      if (!opts.apply) { results.push({ source: source.name, template: draft.name, state: candidate ? "STAGED" : "WOULD_CREATE" }); continue; }
      candidate ??= await prisma.whatsappTemplate.create({ data: { ...data, language: "ar", status: "DRAFT", notificationUpgrade: { version: welcomeMarketing ? 3 : 2, ...(welcomeMarketing ? { policy: "WELCOME_MARKETING_V3" } : {}), sourceId: source.id, sourceHash: draft.sourceHash, draftHash, receipt, events, locales: [...SUPPORTED_LOCALES] } } });
      if (opts.publish) {
        const { publishWhatsappTemplateToMeta } = await import("./meta-template-publisher");
        const result = await publishWhatsappTemplateToMeta(candidate.id, { actorRole: "SYSTEM" }, { defaultOnly: true });
        results.push({ source: source.name, template: candidate.name, state: result.ok ? "SUBMITTED" : "PUBLISH_FAILED", ...(result.ok ? {} : { reason: result.errors.map(row => `${row.language}:${row.reason}`).join(", "), errors: result.errors.map(row => ({ language: row.language, reason: row.reason, detail: row.detail })) }) });
      } else results.push({ source: source.name, template: candidate.name, state: "STAGED" });
    } catch (error) { results.push({ source: source.name, state: "REVIEW_REQUIRED", reason: error instanceof Error ? error.message : "UNKNOWN" }); }
  }
  return { readOnly: !opts.apply, recipientMessages: 0, results };
}

/** Cron switches only unchanged, fully approved replacements. All reads and the
 * trigger swap are in the same transaction; the source write detects concurrent
 * editorial changes. Financial tables and old message history are untouched. */
export async function activateApprovedNotificationUpgrades() {
  const candidates = await prisma.whatsappTemplate.findMany({ where: { name: { contains: "_notice_" }, status: { in: ["DRAFT", "READY", "NEEDS_REVIEW"] } } });
  const results: Array<{ template: string; state: string; approved?: number; triggers?: number }> = [];
  for (const candidate of candidates) {
    const marker = object(candidate.notificationUpgrade);
    if (![1, 2, 3].includes(Number(marker.version)) || marker.activatedAt || typeof marker.sourceId !== "string") continue;
    const result = await prisma.$transaction(async tx => {
      const [senders, source, current] = await Promise.all([
        tx.communicationSender.findMany({ where: defaults }),
        tx.whatsappTemplate.findUnique({ where: { id: marker.sourceId as string } }),
        tx.whatsappTemplate.findUnique({ where: { id: candidate.id } }),
      ]);
      if (senders.length !== 1 || !senders[0].enabled || senders[0].status !== "ACTIVE" || !senders[0].businessAccountId) return { state: "DEFAULT_SENDER_REQUIRED" };
      const currentMarker = object(current?.notificationUpgrade);
      if (currentMarker.activatedAt) return { state: "ALREADY_ACTIVE" };
      // Old staged generations remain for history after a newer successor is
      // activated. They are no longer candidates for a trigger swap and must
      // not report misleading approval/editorial blockers on every cron run.
      const active = source ? await tx.messageTrigger.findMany({ where: { channel: "WHATSAPP", templateId: source.id, enabled: true } }) : [];
      if (source && current && !active.length) return { state: "SUPERSEDED" };
      if (!source || !current || notificationTemplateHash(source) !== marker.sourceHash || notificationTemplateHash(current) !== marker.draftHash) return { state: "EDITORIAL_CHANGES_REQUIRE_REVIEW" };
      const welcomeMarketing = marker.version === 3 && marker.policy === "WELCOME_MARKETING_V3";
      if (marker.version === 3 && (!welcomeMarketing || !Array.isArray(marker.events) || marker.events.some(event => event !== "USER_REGISTERED"))) return { state: "UPGRADE_POLICY_REVIEW_REQUIRED" };
      const draft = notificationUpgradeDraft(source as NotificationTemplateSource, marker.receipt === true, welcomeMarketing);
      if (candidate.name !== draft.name) return { state: "SUPERSEDED" };
      const variants = await tx.whatsappTemplateWabaVariant.findMany({ where: { templateId: candidate.id, provider: "META_WHATSAPP", businessAccountId: senders[0].businessAccountId } });
      const approved = approvedNotificationLocales(draft, variants).length;
      if (approved !== SUPPORTED_LOCALES.length) return { state: "AWAITING_APPROVAL", approved };
      const expectedEvents = Array.isArray(marker.events) ? marker.events : [];
      if (!active.length || active.some(row => !expectedEvents.includes(row.event))) return { state: "TRIGGERS_CHANGED_REQUIRE_REVIEW" };
      // Locks the source against a simultaneous editor update without changing its content/status.
      await tx.whatsappTemplate.update({ where: { id: source.id }, data: { updatedAt: new Date() } });
      await tx.whatsappTemplate.update({ where: { id: candidate.id }, data: { status: "READY", notificationUpgrade: json({ ...currentMarker, activatedAt: new Date().toISOString() }) } });
      const switched = await tx.messageTrigger.updateMany({ where: { id: { in: active.map(row => row.id) }, templateId: source.id }, data: { templateId: candidate.id } });
      return { state: "ACTIVATED", approved, triggers: switched.count };
    });
    results.push({ template: candidate.name, ...result });
    if (result.state === "ACTIVATED") await writeAuditLog({ actorRole: "SYSTEM", action: "NOTIFICATION_TEMPLATE_UPGRADE_ACTIVATED", messageAr: "تم تفعيل قالب الإشعارات المترجم بعد اعتماد كل اللغات على الرقم الافتراضي", entityType: "WhatsappTemplate", entityId: candidate.id, metadata: { sourceId: marker.sourceId, ...result } });
  }
  return { recipientMessages: 0, results };
}
