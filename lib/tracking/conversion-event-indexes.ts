import { prisma } from "@/lib/prisma";

let ready: Promise<void> | null = null;

async function createIndex(name: string, key: Record<string, 1 | -1>, unique = false) {
  await prisma.$runCommandRaw({
    createIndexes: "ConversionEvent",
    indexes: [{ key, name, unique }],
  });
}

export async function ensureConversionEventIndexes() {
  if (!ready) {
    ready = (async () => {
      try {
        await createIndex("conversion_event_dedup_lookup", { platform: 1, eventId: 1, channel: 1 }, true);
        await createIndex("conversion_event_donation_status_lookup", { donationId: 1, platform: 1, channel: 1, eventName: 1, status: 1 });
        await createIndex("conversion_event_dashboard_filters", { platform: 1, channel: 1, status: 1, createdAt: -1 });
        await createIndex("conversion_event_created_at_desc", { createdAt: -1 });
      } catch (error) {
        console.error("[conversion-event-indexes] failed", error);
      }
    })();
  }
  return ready;
}
