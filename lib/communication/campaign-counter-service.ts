import { prisma } from "@/lib/prisma";

/**
 * Derive a campaign's headline counters from its delivery rows instead of trusting what was written
 * at send time.
 *
 * `executeCampaignSend` stamps `sentCount`/`failedCount` once, from what the provider answered
 * during the call — and for Elastic Email that answer only ever means "the message was ACCEPTED".
 * The real outcome (Suppress, Error, bounce) arrives minutes later and is applied to the
 * `CommunicationDelivery` rows by the webhook / event-sync cron. Nothing ever carried it back up to
 * the campaign, so a campaign whose only delivery reads FAILED — "Delivery failed due to account
 * problem or spam block" — still showed «أُرسلت 1 · وصلت 0 · فشلت 0» on the campaign screen. The
 * delivery log knew the truth; the campaign header contradicted it.
 *
 * `deliveredCount` was never written by any code path at all, which is why the «وصلت» tile read 0
 * even for mail that was opened and clicked.
 */

/** Provider accepted it and nothing has contradicted that yet. */
const ACCEPTED = new Set(["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"]);
/**
 * Arrival is *proven*. Elastic Email never emits a `Delivered` event — its `Sent` event means
 * "handed to the recipient's mail server" and that is already folded into ACCEPTED — so an open, a
 * read, a click or a reply is the only positive evidence a message reached a human.
 */
const ARRIVED = new Set(["DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED"]);
const READ_LIKE = new Set(["READ", "OPENED"]);
const CLICKED_LIKE = new Set(["CLICKED", "REPLIED"]);
/** Terminal failures. UNSUBSCRIBED is terminal too but is not a delivery failure, so it is counted apart. */
const FAILURES = new Set(["FAILED", "BOUNCED"]);

/**
 * Statuses whose value is a *result* and may therefore be re-derived. DRAFT/REVIEW/APPROVED/
 * SCHEDULED describe where a human left the campaign, SENDING means a run is in flight and the
 * executor owns the field, and CANCELLED/ARCHIVED are deliberate end states — recomputing any of
 * those would overwrite an intent with an observation.
 */
const RECOMPUTABLE_STATUS = new Set(["SENT", "SENT_WITH_ISSUES", "FAILED", "BLOCKED"]);

export type CampaignCounters = {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  clicked: number;
  failed: number;
  skipped: number;
  unsubscribed: number;
};

/**
 * The one place that turns a run's tallies into a campaign status. Shared by the send executor
 * (which counts what just happened) and the reconciler (which counts what the rows now say), so the
 * two can never drift into disagreeing about what "SENT" means.
 */
export function computeFinalStatus(total: number, sent: number, skipped: number, failed: number): string {
  if (total === 0) return "BLOCKED";
  if (sent > 0 && failed === 0 && skipped === 0) return "SENT";
  if (sent > 0) return "SENT_WITH_ISSUES";
  if (failed > 0) return "FAILED";
  return "BLOCKED";
}

export function tallyDeliveryStatuses(statuses: readonly (string | null)[]): CampaignCounters {
  const counters: CampaignCounters = { total: 0, sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, skipped: 0, unsubscribed: 0 };
  for (const raw of statuses) {
    const status = raw ?? "";
    counters.total += 1;
    if (ACCEPTED.has(status)) counters.sent += 1;
    if (ARRIVED.has(status)) counters.delivered += 1;
    if (READ_LIKE.has(status)) counters.read += 1;
    if (CLICKED_LIKE.has(status)) counters.clicked += 1;
    if (FAILURES.has(status)) counters.failed += 1;
    if (status === "SKIPPED") counters.skipped += 1;
    if (status === "UNSUBSCRIBED") counters.unsubscribed += 1;
  }
  return counters;
}

export type RecomputeResult =
  | { ok: true; changed: boolean; counters: CampaignCounters; status: string }
  | { ok: false; reason: string };

/**
 * Re-derive one campaign's counters (and, when the status is a result rather than an intent, its
 * status) from the delivery rows. Idempotent and safe to call on every event batch.
 */
export async function recomputeCampaignCounters(campaignId: string): Promise<RecomputeResult> {
  if (!process.env.DATABASE_URL) return { ok: false, reason: "DATABASE_UNAVAILABLE" };

  const campaign = await prisma.communicationCampaign
    .findUnique({
      where: { id: campaignId },
      select: { status: true, sentCount: true, deliveredCount: true, readCount: true, clickedCount: true, failedCount: true },
    })
    .catch(() => null);
  if (!campaign) return { ok: false, reason: "NOT_FOUND" };

  const rows = await prisma.communicationDelivery
    .findMany({ where: { campaignId }, select: { status: true } })
    .catch(() => null);
  if (!rows) return { ok: false, reason: "QUERY_FAILED" };
  // No rows means the run never got as far as archiving anything; leave the stored numbers alone
  // rather than zeroing a campaign whose deliveries are simply not written yet.
  if (!rows.length) return { ok: true, changed: false, counters: tallyDeliveryStatuses([]), status: campaign.status };

  const counters = tallyDeliveryStatuses(rows.map((row) => row.status));
  const status = RECOMPUTABLE_STATUS.has(campaign.status)
    ? computeFinalStatus(counters.total, counters.sent, counters.skipped, counters.failed)
    : campaign.status;

  const changed =
    campaign.sentCount !== counters.sent ||
    campaign.deliveredCount !== counters.delivered ||
    campaign.readCount !== counters.read ||
    campaign.clickedCount !== counters.clicked ||
    campaign.failedCount !== counters.failed ||
    campaign.status !== status;
  if (!changed) return { ok: true, changed: false, counters, status };

  const updated = await prisma.communicationCampaign
    .update({
      where: { id: campaignId },
      data: {
        status,
        sentCount: counters.sent,
        deliveredCount: counters.delivered,
        readCount: counters.read,
        clickedCount: counters.clicked,
        failedCount: counters.failed,
      },
    })
    .then(() => true)
    .catch(() => false);
  if (!updated) return { ok: false, reason: "UPDATE_FAILED" };

  return { ok: true, changed: true, counters, status };
}

/** Recompute a set of campaigns, skipping blanks. Returns how many rows actually moved. */
export async function recomputeCampaignCountersFor(campaignIds: Iterable<string | null | undefined>): Promise<number> {
  let changed = 0;
  for (const id of new Set([...campaignIds].filter((value): value is string => !!value))) {
    const result = await recomputeCampaignCounters(id);
    if (result.ok && result.changed) changed += 1;
  }
  return changed;
}
