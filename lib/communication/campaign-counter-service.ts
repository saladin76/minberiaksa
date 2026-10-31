import { prisma } from "@/lib/prisma";

/** Counters reflect delivery records, not a promise that provider acceptance is delivery. */
const ACCEPTED = new Set(["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"]);
const ARRIVED = new Set(["DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"]);
const READ_LIKE = new Set(["READ", "OPENED"]);
// A reply proves engagement, but provides no evidence that a URL was clicked.
const CLICKED_LIKE = new Set(["CLICKED"]);
const FAILURES = new Set(["FAILED", "BOUNCED"]);
const RECOMPUTABLE_STATUS = new Set(["SENT", "SENT_WITH_ISSUES", "FAILED", "BLOCKED"]);

export type CampaignCounters = {
  total: number; sent: number; delivered: number; read: number; clicked: number;
  replied: number; failed: number; skipped: number; unsubscribed: number;
};

/** One indexed server aggregation, without loading message bodies or donor contacts.
 * Includes retries and webhook evidence even while a campaign remains blocked. */
export async function readCampaignDeliveryCounters(ids: string[]): Promise<Map<string, CampaignCounters>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, CampaignCounters>(unique.map(id => [id, tallyDeliveryStatuses([])]));
  if (!unique.length) return result;
  if (unique.some(id => !/^[a-f0-9]{24}$/i.test(id))) throw new Error("INVALID_CAMPAIGN_ID");
  const present = (field: string) => ({ $ne: [{ $ifNull: [`$${field}`, null] }, null] });
  const statusIn = (values: Set<string>) => ({ $in: ["$status", [...values]] });
  const sum = (conditions: unknown[]) => ({ $sum: { $cond: [{ $or: conditions }, 1, 0] } });
  const rows = await prisma.communicationDelivery.aggregateRaw({ pipeline: [
    { $match: { campaignId: { $in: unique.map(id => ({ $oid: id })) } } },
    { $group: { _id: "$campaignId", total: { $sum: 1 },
      sent: sum([statusIn(ACCEPTED), present("sentAt"), { $and: [present("providerMessageId"), { $ne: ["$providerMessageId", ""] }] }]),
      delivered: sum([statusIn(ARRIVED), ...["deliveredAt", "readAt", "openedAt", "clickedAt", "repliedAt"].map(present)]),
      read: sum([statusIn(READ_LIKE), ...["readAt", "openedAt", "clickedAt", "repliedAt"].map(present)]),
      clicked: sum([statusIn(CLICKED_LIKE), present("clickedAt")]),
      replied: sum([{ $eq: ["$status", "REPLIED"] }, present("repliedAt")]),
      failed: sum([statusIn(FAILURES)]), skipped: sum([{ $eq: ["$status", "SKIPPED"] }]), unsubscribed: sum([{ $eq: ["$status", "UNSUBSCRIBED"] }]),
    } },
  ] as never, options: { maxTimeMS: 15000 } });
  if (!Array.isArray(rows)) throw new Error("CAMPAIGN_COUNTERS_UNAVAILABLE");
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = typeof row._id === "string" ? row._id : (row._id as { $oid?: string } | null)?.$oid;
    if (!id || !result.has(id)) throw new Error("INVALID_CAMPAIGN_COUNTER_ROW");
    const counters = tallyDeliveryStatuses([]);
    for (const key of Object.keys(counters) as Array<keyof CampaignCounters>) {
      if (typeof row[key] !== "number" || !Number.isSafeInteger(row[key]) || row[key] < 0) throw new Error("INVALID_CAMPAIGN_COUNTER_VALUE");
      counters[key] = row[key];
    }
    result.set(id, counters);
  }
  return result;
}

export function computeFinalStatus(total: number, sent: number, skipped: number, failed: number): string {
  if (total <= 0) return "BLOCKED";
  // A partial result or a still-rendered attempt is never an entirely sent audience.
  if (sent === total && sent > 0 && failed === 0 && skipped === 0) return "SENT";
  if (sent > 0) return "SENT_WITH_ISSUES";
  if (failed > 0) return "FAILED";
  return "BLOCKED";
}

export function tallyDeliveryStatuses(statuses: readonly (string | null)[]): CampaignCounters {
  const counters: CampaignCounters = { total: 0, sent: 0, delivered: 0, read: 0, clicked: 0, replied: 0, failed: 0, skipped: 0, unsubscribed: 0 };
  for (const raw of statuses) {
    const status = raw ?? "";
    counters.total++;
    if (ACCEPTED.has(status)) counters.sent++;
    if (ARRIVED.has(status)) counters.delivered++;
    if (READ_LIKE.has(status)) counters.read++;
    if (CLICKED_LIKE.has(status)) counters.clicked++;
    if (status === "REPLIED") counters.replied++;
    if (FAILURES.has(status)) counters.failed++;
    if (status === "SKIPPED") counters.skipped++;
    if (status === "UNSUBSCRIBED") counters.unsubscribed++;
  }
  return counters;
}

type DeliveryEngagementRow = {
  status: string | null; deliveredAt: Date | null; readAt: Date | null;
  openedAt: Date | null; clickedAt: Date | null; repliedAt: Date | null;
  sentAt?: Date | null; providerMessageId?: string | null;
};

/** Timestamp evidence survives subsequent status transitions. */
export function tallyDeliveryRows(rows: readonly DeliveryEngagementRow[]): CampaignCounters {
  const counters: CampaignCounters = { total: 0, sent: 0, delivered: 0, read: 0, clicked: 0, replied: 0, failed: 0, skipped: 0, unsubscribed: 0 };
  for (const row of rows) {
    const status = row.status ?? "";
    counters.total++;
    if (row.sentAt || row.providerMessageId || ACCEPTED.has(status)) counters.sent++;
    if (row.deliveredAt || row.readAt || row.openedAt || row.clickedAt || row.repliedAt || ARRIVED.has(status)) counters.delivered++;
    if (row.readAt || row.openedAt || row.clickedAt || row.repliedAt || READ_LIKE.has(status)) counters.read++;
    if (row.clickedAt || CLICKED_LIKE.has(status)) counters.clicked++;
    if (row.repliedAt || status === "REPLIED") counters.replied++;
    if (FAILURES.has(status)) counters.failed++;
    if (status === "SKIPPED") counters.skipped++;
    if (status === "UNSUBSCRIBED") counters.unsubscribed++;
  }
  return counters;
}

export type RecomputeResult =
  | { ok: true; changed: boolean; counters: CampaignCounters; status: string }
  | { ok: false; reason: string };

/** Conditional update protects concurrent cancellation, archiving and resumed work. */
export async function recomputeCampaignCounters(campaignId: string): Promise<RecomputeResult> {
  if (!process.env.DATABASE_URL) return { ok: false, reason: "DATABASE_UNAVAILABLE" };
  try {
    const campaign = await prisma.communicationCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true, updatedAt: true, metadata: true, sentCount: true, deliveredCount: true, readCount: true, clickedCount: true, repliedCount: true, failedCount: true },
    });
    if (!campaign) return { ok: false, reason: "NOT_FOUND" };
    const rows = await prisma.communicationDelivery.findMany({
      where: { campaignId }, select: { status: true, sentAt: true, providerMessageId: true, deliveredAt: true, readAt: true, openedAt: true, clickedAt: true, repliedAt: true },
    });
    if (!rows.length) return { ok: true, changed: false, counters: tallyDeliveryStatuses([]), status: campaign.status };
    const counters = tallyDeliveryRows(rows);
    const metadata = campaign.metadata as { sendProgress?: { done?: boolean } } | null;
    const incompleteWalk = !!metadata?.sendProgress && metadata.sendProgress.done !== true;
    const status = RECOMPUTABLE_STATUS.has(campaign.status) && !incompleteWalk
      ? computeFinalStatus(counters.total, counters.sent, counters.skipped, counters.failed)
      : campaign.status;
    const changed = campaign.sentCount !== counters.sent || campaign.deliveredCount !== counters.delivered ||
      campaign.readCount !== counters.read || campaign.clickedCount !== counters.clicked ||
      campaign.repliedCount !== counters.replied || campaign.failedCount !== counters.failed || campaign.status !== status;
    if (!changed) return { ok: true, changed: false, counters, status };
    const updated = await prisma.communicationCampaign.updateMany({
      where: { id: campaignId, status: campaign.status, updatedAt: campaign.updatedAt },
      data: { status, sentCount: counters.sent, deliveredCount: counters.delivered, readCount: counters.read, clickedCount: counters.clicked, repliedCount: counters.replied, failedCount: counters.failed },
    });
    if (updated.count !== 1) return { ok: false, reason: "CAMPAIGN_STATE_CHANGED" };
    return { ok: true, changed: true, counters, status };
  } catch {
    return { ok: false, reason: "COUNTER_READ_OR_WRITE_FAILED" };
  }
}

export async function recomputeCampaignCountersFor(campaignIds: Iterable<string | null | undefined>): Promise<number> {
  let changed = 0;
  for (const id of new Set([...campaignIds].filter((value): value is string => !!value))) {
    const result = await recomputeCampaignCounters(id);
    if (result.ok && result.changed) changed++;
  }
  return changed;
}
