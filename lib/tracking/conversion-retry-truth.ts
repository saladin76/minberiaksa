import { prisma } from "@/lib/prisma";
import { ensureConversionEventIndexes } from "@/lib/tracking/conversion-event-indexes";

export type ConversionRetryCandidate = {
  donationId: string;
  paidAt: string | null;
  status: string;
  amount: number;
  currency: string | null;
  missingPlatforms: string[];
  failedEvents: number;
  skippedEvents: number;
  reason: string;
};

export type ConversionRetryTruthOverview = {
  source: string;
  generatedAt: string;
  summary: {
    candidates: number;
    failedEvents: number;
    skippedEvents: number;
  };
  candidates: ConversionRetryCandidate[];
};

type RawConversionEvent = {
  donationId?: string;
  platform?: string;
  channel?: string;
  eventName?: string;
  status?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getConversionRetryTruthOverview(days = 7): Promise<ConversionRetryTruthOverview> {
  await ensureConversionEventIndexes();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const paidDonations = await prisma.donation.findMany({
    where: { status: "PAID", paidAt: { gte: since } },
    orderBy: { paidAt: "desc" },
    take: 200,
    select: { id: true, status: true, paidAt: true, totalAmount: true, amount: true, currency: true },
  });

  if (paidDonations.length === 0) {
    return {
      source: "conversion-retry-truth",
      generatedAt: new Date().toISOString(),
      summary: { candidates: 0, failedEvents: 0, skippedEvents: 0 },
      candidates: [],
    };
  }

  const ids = paidDonations.map((donation) => donation.id);
  const result = await prisma.$runCommandRaw({
    find: "ConversionEvent",
    filter: { donationId: { $in: ids }, eventName: { $in: ["Donate", "purchase"] } },
    projection: { donationId: 1, platform: 1, channel: 1, eventName: 1, status: 1 },
    limit: 1000,
  });

  const rows: RawConversionEvent[] = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch as RawConversionEvent[]
    : [];

  const byDonation = new Map<string, RawConversionEvent[]>();
  for (const row of rows) {
    if (!row.donationId) continue;
    byDonation.set(row.donationId, [...(byDonation.get(row.donationId) ?? []), row]);
  }

  const candidates: ConversionRetryCandidate[] = [];

  for (const donation of paidDonations) {
    const events = byDonation.get(donation.id) ?? [];
    const metaServerSent = events.some((event) => event.platform === "META" && event.channel === "server" && event.eventName === "Donate" && event.status === "SENT");
    const ga4ServerSent = events.some((event) => event.platform === "GA4" && event.channel === "server" && event.eventName === "purchase" && event.status === "SENT");
    const failedEvents = events.filter((event) => event.status === "FAILED").length;
    const skippedEvents = events.filter((event) => event.status === "SKIPPED").length;
    const missingPlatforms: string[] = [];

    if (!metaServerSent) missingPlatforms.push("META server Donate");
    if (!ga4ServerSent) missingPlatforms.push("GA4 server purchase");

    if (missingPlatforms.length === 0 && failedEvents === 0) continue;

    candidates.push({
      donationId: donation.id,
      paidAt: donation.paidAt?.toISOString() ?? null,
      status: donation.status,
      amount: Number(donation.totalAmount ?? donation.amount ?? 0),
      currency: donation.currency,
      missingPlatforms,
      failedEvents,
      skippedEvents,
      reason: missingPlatforms.length > 0
        ? "ConversionEvent ledger لا يحتوي على SENT لكل أحداث السيرفر المطلوبة."
        : "يوجد أحداث فاشلة تحتاج مراجعة.",
    });
  }

  return {
    source: "conversion-retry-truth",
    generatedAt: new Date().toISOString(),
    summary: {
      candidates: candidates.length,
      failedEvents: candidates.reduce((total, item) => total + item.failedEvents, 0),
      skippedEvents: candidates.reduce((total, item) => total + item.skippedEvents, 0),
    },
    candidates,
  };
}
