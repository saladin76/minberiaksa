import { prisma } from "@/lib/prisma";

export type ConversionAuditStage =
  | "track_conversion_request"
  | "track_conversion_rejected"
  | "track_conversion_allowed"
  | "meta_capi_attempt"
  | "meta_capi_result"
  | "ga4_purchase_attempt";

export async function writeConversionAudit(input: {
  donationId?: string | null;
  eventId?: string | null;
  stage: ConversionAuditStage;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorRole: "SYSTEM",
        action: "CONVERSION_TRACKING_AUDIT",
        messageAr: input.message,
        messageEn: input.message,
        entityType: "Donation",
        entityId: input.donationId ?? input.eventId ?? undefined,
        metadata: {
          stage: input.stage,
          donation_id: input.donationId ?? null,
          event_id: input.eventId ?? null,
          ...(input.metadata ?? {}),
        },
        stream: "TEAM",
      },
    });
  } catch (error) {
    console.error("[conversion-audit] failed", error);
  }
}

export function pickAttributionForAudit(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_id",
    "utm_term",
    "utm_content",
    "campaign_id",
    "adset_id",
    "ad_id",
    "placement",
    "device",
    "platform",
    "audience_type",
    "funnel",
    "objective",
    "language",
    "target_country",
    "fbclid",
    "fbc",
    "fbp",
    "gclid",
    "ttclid",
    "landing_page",
    "referrer",
    "client_ip",
    "user_agent",
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = src[key];
    if (typeof value === "string" && value.trim()) out[key] = value.slice(0, 2048);
  }
  return out;
}

export function toTurkeyIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+03:00`;
}
