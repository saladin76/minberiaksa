import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { donorChannelEligibility } from "./audience-service";
import type { CommunicationChannelId } from "./communication-runtime-types";

/**
 * Custom & TEST audience lists. Automatic language segments are NOT stored here (they are computed
 * live by audience-service). This module reads/writes only the two list models, never sends, never
 * creates donors, and never seeds demo data. DONOR members resolve to live donor data at read time;
 * TEST_CONTACT members hold ad-hoc contact info used only for test sends.
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
export type ServiceResult<T = { id: string }> = { ok: true; data: T } | { ok: false; status: number; error: string };

export type AudienceListType = "CUSTOM" | "TEST";
export const AUDIENCE_LIST_PREFIX = "list:";

async function audit(actor: Actor, action: string, ar: string, en: string, entityId: string, metadata: Record<string, unknown>) {
  await writeAuditLog({
    actorId: actor.actorId ?? undefined,
    actorName: actor.actorName ?? undefined,
    actorRole: actor.actorRole ?? "ADMIN",
    action,
    messageAr: ar,
    messageEn: en,
    entityType: "CommunicationAudienceList",
    entityId,
    metadata: { ...metadata, externalCall: false },
    stream: "TEAM",
  });
}

// ─────────────────────────── Read ───────────────────────────

export type AudienceListSummary = {
  id: string;
  name: string;
  description: string | null;
  type: AudienceListType;
  status: string;
  locale: string | null;
  channels: string[];
  membersCount: number;
  owner: string | null;
  updatedAt: string;
  lastTestAt: string | null;
};

export async function listAudienceLists(): Promise<AudienceListSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  const lists = await prisma.communicationAudienceList.findMany({ orderBy: { updatedAt: "desc" }, take: 300 }).catch(() => []);
  if (lists.length === 0) return [];
  const counts = await prisma.communicationAudienceMember.groupBy({ by: ["listId"], where: { status: "ACTIVE" }, _count: { _all: true } }).catch(() => [] as { listId: string; _count: { _all: number } }[]);
  const countMap = new Map(counts.map((c) => [c.listId, c._count._all]));
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description ?? null,
    type: (l.type === "TEST" ? "TEST" : "CUSTOM") as AudienceListType,
    status: l.status,
    locale: l.locale ?? null,
    channels: l.channels ?? [],
    membersCount: countMap.get(l.id) ?? 0,
    owner: l.createdByName ?? null,
    updatedAt: l.updatedAt.toISOString(),
    lastTestAt: (l.metadata as { lastTestAt?: string } | null)?.lastTestAt ?? null,
  }));
}

export type AudienceMemberView = {
  id: string;
  contactType: "DONOR" | "TEST_CONTACT";
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: string | null;
};

export async function getAudienceList(id: string): Promise<{ list: AudienceListSummary; members: AudienceMemberView[] } | null> {
  if (!process.env.DATABASE_URL) return null;
  const l = await prisma.communicationAudienceList.findUnique({ where: { id } }).catch(() => null);
  if (!l) return null;
  const rows = await prisma.communicationAudienceMember.findMany({ where: { listId: id, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 2000 }).catch(() => []);

  // Resolve DONOR members' live data.
  const donorIds = rows.filter((m) => m.contactType === "DONOR" && m.userId).map((m) => m.userId!) as string[];
  const donors = donorIds.length
    ? await prisma.user.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true, phone: true, preferredLang: true } }).catch(() => [])
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const members: AudienceMemberView[] = rows.map((m) => {
    if (m.contactType === "DONOR" && m.userId) {
      const d = donorMap.get(m.userId);
      return { id: m.id, contactType: "DONOR", userId: m.userId, name: d?.name ?? null, email: d?.email ?? null, phone: d?.phone ?? null, locale: d?.preferredLang ?? m.locale ?? null };
    }
    return { id: m.id, contactType: "TEST_CONTACT", userId: null, name: m.name ?? null, email: m.email ?? null, phone: m.phone ?? null, locale: m.locale ?? null };
  });

  const summary: AudienceListSummary = {
    id: l.id, name: l.name, description: l.description ?? null, type: (l.type === "TEST" ? "TEST" : "CUSTOM"),
    status: l.status, locale: l.locale ?? null, channels: l.channels ?? [], membersCount: members.length,
    owner: l.createdByName ?? null, updatedAt: l.updatedAt.toISOString(), lastTestAt: (l.metadata as { lastTestAt?: string } | null)?.lastTestAt ?? null,
  };
  return { list: summary, members };
}

// ─────────────────────────── Mutations ───────────────────────────

export async function createAudienceList(
  input: { name: string; description?: string | null; type?: AudienceListType; locale?: string | null; channels?: string[] },
  actor: Actor
): Promise<ServiceResult> {
  if (!process.env.DATABASE_URL) return { ok: false, status: 503, error: "DATABASE_URL is not configured." };
  const name = input.name?.trim();
  if (!name) return { ok: false, status: 400, error: "اسم القائمة مطلوب." };
  const channels = (input.channels ?? []).filter((c) => ["WHATSAPP", "EMAIL", "SMS"].includes(c));
  try {
    const row = await prisma.communicationAudienceList.create({
      data: {
        name,
        description: input.description ?? null,
        type: input.type === "TEST" ? "TEST" : "CUSTOM",
        status: "ACTIVE",
        locale: input.locale && isValidLocale(input.locale) ? input.locale : null,
        channels,
        createdBy: actor.actorId ?? null,
        createdByName: actor.actorName ?? null,
      },
      select: { id: true },
    });
    await audit(actor, "communication.audience-list.create", `إنشاء قائمة جمهور: ${name}`, `Created audience list: ${name}`, row.id, { type: input.type ?? "CUSTOM" });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("createAudienceList failed", error);
    return { ok: false, status: 500, error: "تعذّر إنشاء القائمة." };
  }
}

export async function updateAudienceList(id: string, patch: { name?: string; description?: string | null; channels?: string[]; locale?: string | null; status?: string }, actor: Actor): Promise<ServiceResult> {
  const l = await prisma.communicationAudienceList.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
  if (!l) return { ok: false, status: 404, error: "القائمة غير موجودة." };
  const status = patch.status && ["ACTIVE", "ARCHIVED"].includes(patch.status.toUpperCase()) ? patch.status.toUpperCase() : undefined;
  try {
    await prisma.communicationAudienceList.update({
      where: { id },
      data: {
        name: patch.name?.trim() || undefined,
        description: patch.description ?? undefined,
        channels: patch.channels ? patch.channels.filter((c) => ["WHATSAPP", "EMAIL", "SMS"].includes(c)) : undefined,
        locale: patch.locale === undefined ? undefined : patch.locale && isValidLocale(patch.locale) ? patch.locale : null,
        status,
      },
    });
    await audit(actor, status === "ARCHIVED" ? "communication.audience-list.archive" : "communication.audience-list.update", `تعديل قائمة جمهور`, `Updated audience list`, id, { status });
    return { ok: true, data: { id } };
  } catch (error) {
    console.error("updateAudienceList failed", error);
    return { ok: false, status: 500, error: "تعذّر تحديث القائمة." };
  }
}

export async function duplicateAudienceList(id: string, actor: Actor): Promise<ServiceResult> {
  const src = await prisma.communicationAudienceList.findUnique({ where: { id } }).catch(() => null);
  if (!src) return { ok: false, status: 404, error: "القائمة غير موجودة." };
  try {
    const copy = await prisma.communicationAudienceList.create({
      data: {
        name: `${src.name} (نسخة)`,
        description: src.description ?? null,
        type: src.type,
        status: "ACTIVE",
        locale: src.locale ?? null,
        channels: src.channels ?? [],
        createdBy: actor.actorId ?? null,
        createdByName: actor.actorName ?? null,
      },
      select: { id: true },
    });
    // Copy members (donor references + test contacts). No delivery/test history is copied.
    const members = await prisma.communicationAudienceMember.findMany({ where: { listId: id, status: "ACTIVE" } }).catch(() => []);
    if (members.length) {
      await prisma.communicationAudienceMember.createMany({
        data: members.map((m) => ({ listId: copy.id, userId: m.userId ?? null, contactType: m.contactType, name: m.name ?? null, email: m.email ?? null, phone: m.phone ?? null, locale: m.locale ?? null, status: "ACTIVE" })),
      }).catch(() => {});
    }
    await audit(actor, "communication.audience-list.duplicate", `نسخ قائمة جمهور: ${src.name}`, `Duplicated audience list: ${src.name}`, copy.id, { sourceId: id, members: members.length });
    return { ok: true, data: { id: copy.id } };
  } catch (error) {
    console.error("duplicateAudienceList failed", error);
    return { ok: false, status: 500, error: "تعذّر نسخ القائمة." };
  }
}

export async function addDonorMembers(listId: string, userIds: string[], actor: Actor): Promise<ServiceResult<{ added: number }>> {
  const list = await prisma.communicationAudienceList.findUnique({ where: { id: listId }, select: { id: true } }).catch(() => null);
  if (!list) return { ok: false, status: 404, error: "القائمة غير موجودة." };
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 1000);
  if (ids.length === 0) return { ok: false, status: 400, error: "لا يوجد متبرعون للإضافة." };
  try {
    // Only add donors not already present.
    const existing = await prisma.communicationAudienceMember.findMany({ where: { listId, userId: { in: ids }, status: "ACTIVE" }, select: { userId: true } }).catch(() => []);
    const have = new Set(existing.map((e) => e.userId));
    const toAdd = ids.filter((id) => !have.has(id));
    if (toAdd.length) {
      await prisma.communicationAudienceMember.createMany({ data: toAdd.map((userId) => ({ listId, userId, contactType: "DONOR", status: "ACTIVE" })) });
    }
    await prisma.communicationAudienceList.update({ where: { id: listId }, data: { updatedAt: new Date() } }).catch(() => {});
    await audit(actor, "communication.audience-list.members.add", `إضافة ${toAdd.length} متبرعًا لقائمة`, `Added ${toAdd.length} donors to list`, listId, { added: toAdd.length });
    return { ok: true, data: { added: toAdd.length } };
  } catch (error) {
    console.error("addDonorMembers failed", error);
    return { ok: false, status: 500, error: "تعذّر إضافة المتبرعين." };
  }
}

export async function addTestContact(listId: string, contact: { name?: string | null; email?: string | null; phone?: string | null; locale?: string | null }, actor: Actor): Promise<ServiceResult> {
  const list = await prisma.communicationAudienceList.findUnique({ where: { id: listId }, select: { id: true } }).catch(() => null);
  if (!list) return { ok: false, status: 404, error: "القائمة غير موجودة." };
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  if (!email && !phone) return { ok: false, status: 400, error: "أدخل بريدًا أو رقمًا لجهة الاختبار." };
  try {
    const row = await prisma.communicationAudienceMember.create({
      data: { listId, userId: null, contactType: "TEST_CONTACT", name: contact.name?.trim() || null, email, phone, locale: contact.locale && isValidLocale(contact.locale) ? contact.locale : null, status: "ACTIVE" },
      select: { id: true },
    });
    await audit(actor, "communication.audience-list.members.add-test", `إضافة جهة اختبار لقائمة`, `Added test contact to list`, listId, { memberId: row.id });
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error("addTestContact failed", error);
    return { ok: false, status: 500, error: "تعذّر إضافة جهة الاختبار." };
  }
}

export async function removeMember(listId: string, memberId: string, actor: Actor): Promise<ServiceResult> {
  try {
    const m = await prisma.communicationAudienceMember.findFirst({ where: { id: memberId, listId }, select: { id: true } }).catch(() => null);
    if (!m) return { ok: false, status: 404, error: "العضو غير موجود." };
    await prisma.communicationAudienceMember.update({ where: { id: memberId }, data: { status: "REMOVED" } });
    await audit(actor, "communication.audience-list.members.remove", `إزالة عضو من قائمة`, `Removed member from list`, listId, { memberId });
    return { ok: true, data: { id: memberId } };
  } catch (error) {
    console.error("removeMember failed", error);
    return { ok: false, status: 500, error: "تعذّر إزالة العضو." };
  }
}

// ─────────────────────────── Send-path resolution (used by recipient service / executor) ───────────────────────────

export function parseListKey(key: string | null | undefined): string | null {
  return key && key.startsWith(AUDIENCE_LIST_PREFIX) ? key.slice(AUDIENCE_LIST_PREFIX.length) : null;
}

/** "TEST" when the campaign audience points at a TEST list, else "CAMPAIGN". */
export async function resolveAudienceOrigin(audienceSegmentKey: string | null | undefined): Promise<"CAMPAIGN" | "TEST"> {
  const listId = parseListKey(audienceSegmentKey);
  if (!listId) return "CAMPAIGN";
  const l = await prisma.communicationAudienceList.findUnique({ where: { id: listId }, select: { type: true } }).catch(() => null);
  return l?.type === "TEST" ? "TEST" : "CAMPAIGN";
}

export type ResolvedListMember = { userId: string | null; name: string | null; email: string | null; phone: string | null; locale: SupportedLocale; country: string | null; contactType: "DONOR" | "TEST_CONTACT" };

/** Resolve a list's ACTIVE members into send-ready contacts (donor data read live). */
export async function loadListMembers(listId: string): Promise<ResolvedListMember[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await prisma.communicationAudienceMember.findMany({ where: { listId, status: "ACTIVE" }, take: 2000 }).catch(() => []);
  const donorIds = rows.filter((m) => m.contactType === "DONOR" && m.userId).map((m) => m.userId!) as string[];
  const donors = donorIds.length
    ? await prisma.user.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true, emailNotifications: true, smsNotifications: true } }).catch(() => [])
    : [];
  const dMap = new Map(donors.map((d) => [d.id, d]));
  const profiles = donorIds.length
    ? await prisma.donorCommunicationProfile.findMany({ where: { userId: { in: donorIds } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } }).catch(() => [])
    : [];
  const pMap = new Map(profiles.map((p) => [p.userId, p]));

  const out: ResolvedListMember[] = [];
  for (const m of rows) {
    if (m.contactType === "DONOR" && m.userId) {
      const d = dMap.get(m.userId);
      if (!d) continue;
      const locale = (d.preferredLang && isValidLocale(d.preferredLang) ? d.preferredLang : DEFAULT_LOCALE) as SupportedLocale;
      out.push({ userId: d.id, name: d.name, email: d.email, phone: d.phone, locale, country: d.countryCode, contactType: "DONOR" });
    } else {
      const locale = (m.locale && isValidLocale(m.locale) ? m.locale : DEFAULT_LOCALE) as SupportedLocale;
      out.push({ userId: null, name: m.name, email: m.email, phone: m.phone, locale, country: null, contactType: "TEST_CONTACT" });
    }
  }
  return out;
}

/** Channel eligibility for a resolved member (donors use consent; test contacts just need contact info). */
export function memberEligibleForChannel(m: ResolvedListMember, channel: CommunicationChannelId, profile?: { doNotContact?: boolean; emailOptIn?: boolean; smsOptIn?: boolean; whatsappOptIn?: boolean } | null): boolean {
  if (m.contactType === "TEST_CONTACT") {
    if (channel === "EMAIL") return !!m.email;
    return !!m.phone; // WHATSAPP / SMS
  }
  return donorChannelEligibility({ email: m.email, phone: m.phone }, channel, profile) === "ELIGIBLE";
}
