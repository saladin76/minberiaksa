import { prisma } from "@/lib/prisma";
import { foundationContactPreferences } from "./contact-preferences-data";
import type { ContactPreference } from "./communication-types";

const objectIdPattern = /^[a-f\d]{24}$/i;
const saveAction = "communication.contact-preference.save";
const removeAction = "communication.contact-preference.remove";
const preferenceActions = [saveAction, removeAction];

type PreferenceActor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };
type StoredPreferenceEntry = { id: string; item: ContactPreference; deleted: boolean };

function safeObjectId(value: string | null | undefined) {
  return value && objectIdPattern.test(value) ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanField(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function storedEntryFromMetadata(metadata: unknown): StoredPreferenceEntry | null {
  const root = metadataObject(metadata);
  const item = metadataObject(root.item);
  const id = stringField(root.id) ?? stringField(item.contactId);
  if (!id) return null;
  return { id, item: normalizeContactPreference({ ...item, contactId: id }), deleted: root.deleted === true };
}

async function readStoredEntries(): Promise<StoredPreferenceEntry[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: { entityType: "CommunicationContactPreference", action: { in: preferenceActions } },
      orderBy: { createdAt: "desc" },
      take: 700,
      select: { metadata: true },
    });
    const latest = new Map<string, StoredPreferenceEntry>();
    for (const row of rows) {
      const parsed = storedEntryFromMetadata(row.metadata);
      if (!parsed) continue;
      if (!latest.has(parsed.id)) latest.set(parsed.id, parsed);
    }
    return [...latest.values()];
  } catch (error) {
    console.error("Contact preferences audit read failed", error);
    return [];
  }
}

function mergePreferences(fallback: ContactPreference[], entries: StoredPreferenceEntry[]) {
  const deletedIds = new Set(entries.filter((entry) => entry.deleted).map((entry) => entry.id));
  const saved = entries.filter((entry) => !entry.deleted).map((entry) => entry.item);
  const savedIds = new Set(saved.map((item) => item.contactId));
  const untouched = fallback.filter((item) => !deletedIds.has(item.contactId) && !savedIds.has(item.contactId));
  return [...saved, ...untouched];
}

async function writePreferenceRecord(params: { item: ContactPreference; deleted?: boolean; actor?: PreferenceActor | null }) {
  if (!process.env.DATABASE_URL) {
    return { ok: false, status: 503, message: "DATABASE_URL is not configured; contact preference was not saved." };
  }
  try {
    await prisma.auditLog.create({
      data: {
        actorId: safeObjectId(params.actor?.actorId),
        actorName: params.actor?.actorName ?? undefined,
        actorRole: params.actor?.actorRole || "ADMIN",
        action: params.deleted ? removeAction : saveAction,
        messageAr: params.deleted ? "تم حذف تفضيلات تواصل" : "تم حفظ تفضيلات تواصل",
        messageEn: params.deleted ? "Contact preference removed" : "Contact preference saved",
        entityType: "CommunicationContactPreference",
        entityId: params.item.contactId,
        metadata: {
          id: params.item.contactId,
          item: params.item,
          deleted: params.deleted === true,
          externalCall: false,
          autoSend: false,
        },
        stream: "TEAM",
      },
    });
    return { ok: true, status: 200, message: params.deleted ? "Contact preference removed." : "Contact preference saved.", data: params.item };
  } catch (error) {
    console.error("Contact preferences audit write failed", error);
    return { ok: false, status: 503, message: "Contact preference save failed." };
  }
}

export function normalizeContactPreference(input: Record<string, unknown>): ContactPreference {
  const now = new Date().toISOString();
  return {
    contactId: stringField(input.contactId) ?? `contact_${Date.now()}`,
    emailOptIn: booleanField(input.emailOptIn, false),
    smsOptIn: booleanField(input.smsOptIn, false),
    whatsappOptIn: booleanField(input.whatsappOptIn, false),
    preferredLanguage: stringField(input.preferredLanguage),
    countryCode: stringField(input.countryCode),
    doNotContact: booleanField(input.doNotContact, false),
    consentSource: stringField(input.consentSource) ?? "manual-dashboard",
    lastConsentAt: stringField(input.lastConsentAt) ?? now,
  };
}

export async function listContactPreferences(): Promise<ContactPreference[]> {
  return mergePreferences(foundationContactPreferences, await readStoredEntries());
}

export async function getContactPreferencesOverview() {
  const preferences = await listContactPreferences();
  return {
    generatedAt: new Date().toISOString(),
    preferences,
    summary: {
      contacts: preferences.length,
      emailOptIn: preferences.filter((item) => item.emailOptIn).length,
      smsOptIn: preferences.filter((item) => item.smsOptIn).length,
      whatsappOptIn: preferences.filter((item) => item.whatsappOptIn).length,
      doNotContact: preferences.filter((item) => item.doNotContact).length,
    },
    safety: {
      externalSideEffects: false,
      autoSend: false,
      note: "تفضيلات التواصل تحفظ داخليًا فقط، ولا ينتج عنها أي إرسال أو اتصال خارجي.",
    },
  };
}

export async function saveContactPreference(item: ContactPreference, actor?: PreferenceActor | null) {
  return writePreferenceRecord({ item, actor });
}

export async function removeContactPreference(item: ContactPreference, actor?: PreferenceActor | null) {
  return writePreferenceRecord({ item, deleted: true, actor });
}
