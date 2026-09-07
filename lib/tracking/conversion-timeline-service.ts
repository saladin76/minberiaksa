import { prisma } from "@/lib/prisma";
import { ensureConversionEventIndexes } from "./conversion-event-indexes";

export type ConversionTimelineStatus = "SENT" | "FAILED" | "SKIPPED" | "PENDING" | "UNKNOWN";

export type ConversionTimelineEvent = {
  id?: string;
  eventId?: string;
  eventName?: string;
  platform?: string;
  channel?: string;
  status: ConversionTimelineStatus;
  donationId?: string;
  value?: number | null;
  currency?: string | null;
  attempts?: number;
  error?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sentAt?: string | null;
};

export type DonationConversionTimeline = {
  source: string;
  generatedAt: string;
  donationId: string;
  summary: {
    totalEvents: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
    serverNeedsRetry: number;
    platforms: string[];
    isComplete: boolean;
  };
  events: ConversionTimelineEvent[];
  nextActions: string[];
};

type RawEvent = {
  _id?: { $oid?: string } | string;
  eventId?: string;
  eventName?: string;
  platform?: string;
  channel?: string;
  status?: string;
  donationId?: string;
  value?: number | null;
  currency?: string | null;
  attempts?: number;
  error?: string | null;
  createdAt?: Date | string | { $date?: string } | null;
  updatedAt?: Date | string | { $date?: string } | null;
  sentAt?: Date | string | { $date?: string } | null;
};

function dateToIso(value: RawEvent["createdAt"]): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "object" && typeof value.$date === "string") {
    const d = new Date(value.$date);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function normalizeStatus(status?: string): ConversionTimelineStatus {
  if (status === "SENT" || status === "FAILED" || status === "SKIPPED" || status === "PENDING") return status;
  return "UNKNOWN";
}

function idOf(raw: RawEvent) {
  if (typeof raw._id === "string") return raw._id;
  return raw._id?.$oid;
}

function normalizeEvent(raw: RawEvent): ConversionTimelineEvent {
  return {
    id: idOf(raw),
    eventId: raw.eventId,
    eventName: raw.eventName,
    platform: raw.platform,
    channel: raw.channel,
    status: normalizeStatus(raw.status),
    donationId: raw.donationId,
    value: raw.value,
    currency: raw.currency,
    attempts: raw.attempts,
    error: raw.error,
    createdAt: dateToIso(raw.createdAt),
    updatedAt: dateToIso(raw.updatedAt),
    sentAt: dateToIso(raw.sentAt),
  };
}

function eventTime(event: ConversionTimelineEvent) {
  const raw = event.updatedAt ?? event.sentAt ?? event.createdAt;
  if (!raw) return 0;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function buildNextActions(events: ConversionTimelineEvent[]) {
  const actions: string[] = [];
  const serverFailed = events.filter((event) => event.channel === "server" && event.status === "FAILED");
  const serverSkipped = events.filter((event) => event.channel === "server" && event.status === "SKIPPED");
  const browserSkipped = events.filter((event) => event.channel === "browser" && event.status === "SKIPPED");

  if (serverFailed.length > 0) actions.push("أعد محاولة أحداث السيرفر الفاشلة بعد مراجعة الخطأ والاعتمادات.");
  if (serverSkipped.length > 0) actions.push("راجع إعدادات المنصة لأن بعض أحداث السيرفر تم تخطيها بسبب نقص الإعداد.");
  if (browserSkipped.length > 0) actions.push("راجع جاهزية browser pixel أو احتمالية حجب المتصفح للحدث.");
  if (events.length === 0) actions.push("لا توجد أحداث تحويل لهذا التبرع بعد. تأكد من أن التبرع مدفوع وأن سجل ConversionEvent يعمل.");
  if (actions.length === 0) actions.push("لا توجد إجراءات عاجلة. راقب تطابق الموقع مع المنصات في reconciliation.");

  return actions;
}

export async function getDonationConversionTimeline(donationId: string): Promise<DonationConversionTimeline> {
  await ensureConversionEventIndexes();

  const result = await prisma.$runCommandRaw({
    find: "ConversionEvent",
    filter: { donationId },
    sort: { updatedAt: 1, createdAt: 1 },
    limit: 100,
    projection: {
      eventId: 1,
      eventName: 1,
      platform: 1,
      channel: 1,
      status: 1,
      donationId: 1,
      value: 1,
      currency: 1,
      attempts: 1,
      error: 1,
      sentAt: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  const rawEvents = typeof result === "object" && result !== null && "cursor" in result
    ? ((result as { cursor?: { firstBatch?: RawEvent[] } }).cursor?.firstBatch ?? [])
    : [];

  const events = rawEvents.map(normalizeEvent).sort((a, b) => eventTime(a) - eventTime(b));
  const platforms = Array.from(new Set(events.map((event) => event.platform).filter(Boolean) as string[])).sort();
  const sent = events.filter((event) => event.status === "SENT").length;
  const failed = events.filter((event) => event.status === "FAILED").length;
  const skipped = events.filter((event) => event.status === "SKIPPED").length;
  const pending = events.filter((event) => event.status === "PENDING").length;
  const serverNeedsRetry = events.filter((event) => event.channel === "server" && event.status !== "SENT").length;

  return {
    source: "ConversionEvent",
    generatedAt: new Date().toISOString(),
    donationId,
    summary: {
      totalEvents: events.length,
      sent,
      failed,
      skipped,
      pending,
      serverNeedsRetry,
      platforms,
      isComplete: events.length > 0 && failed === 0 && pending === 0 && serverNeedsRetry === 0,
    },
    events,
    nextActions: buildNextActions(events),
  };
}
