import { prisma } from "@/lib/prisma";
import type { Prisma, CommunicationCampaign } from "@prisma/client";
import type { SendPlan } from "./campaign-send-planner";
import { isSpamBlock, releaseAt, shouldHold, stagedConfigFor, waveFor } from "./staged-send-policy";

/**
 * Staged e-mail waves (see staged-send-policy.ts). Only decides WHEN a recipient is sent:
 * wave 1 stays in the batch; later waves are parked in the existing deferral queue
 * (CommunicationCampaignDeferredRecipient, the same one quiet hours use) with a release
 * time measured from the campaign's actual start. The executor releases them as they fall
 * due, with its normal de-duplication, so nobody is skipped or sent twice.
 */
export const STAGED_HOLD = "CommunicationStagedHold";
const OPEN_STATUSES = ["OPENED", "CLICKED"];
const PROCESSED = ["SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED", "FAILED", "BOUNCED"];
const SPAM_WORDS = ["spam", "blacklist", "blocklist", "block", "reputation", "account problem"];

export async function queueStagedRecipients(campaign: CommunicationCampaign, plan: SendPlan, startedAt: Date): Promise<SendPlan> {
  const cfg = stagedConfigFor(campaign);
  if (!cfg.enabled || !plan.recipients.length || !Number.isFinite(startedAt.getTime())) return plan;
  const now = new Date();
  const rawEmails = plan.recipients.map((r) => String(r.email ?? "").trim()).filter(Boolean);
  const emails = [...new Set([...rawEmails, ...rawEmails.map((e) => e.toLowerCase())])];
  const userIds = [...new Set(plan.recipients.map((r) => r.userId).filter((x): x is string => typeof x === "string" && /^[a-f\d]{24}$/i.test(x)))];
  const [opens, paid] = await Promise.all([
    emails.length
      ? prisma.communicationDelivery.findMany({
          where: { channel: "EMAIL", recipientEmail: { in: emails }, OR: [{ openedAt: { not: null } }, { clickedAt: { not: null } }, { status: { in: OPEN_STATUSES } }] },
          select: { recipientEmail: true, openedAt: true, clickedAt: true, updatedAt: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.donation.groupBy({ by: ["donorId"], where: { donorId: { in: userIds }, status: "PAID" }, _max: { paidAt: true } })
      : Promise.resolve([]),
  ]);
  const lastOpen = new Map<string, Date>();
  for (const o of opens) {
    const at = o.clickedAt ?? o.openedAt ?? o.updatedAt, key = String(o.recipientEmail ?? "").toLowerCase();
    if (key && at && (!lastOpen.get(key) || lastOpen.get(key)! < at)) lastOpen.set(key, at);
  }
  const lastPaid = new Map<string, Date>();
  for (const p of paid as Array<{ donorId: string | null; _max: { paidAt: Date | null } }>) if (p.donorId && p._max.paidAt) lastPaid.set(p.donorId, p._max.paidAt);

  const later: Array<{ r: SendPlan["recipients"][number]; at: Date }> = [];
  const now1: SendPlan["recipients"] = [];
  for (const r of plan.recipients) {
    const wave = waveFor({ lastEngagedAt: lastOpen.get(String(r.email ?? "").trim().toLowerCase()) ?? null, lastPaidAt: (r.userId && lastPaid.get(r.userId)) || null, now, cfg });
    const at = releaseAt(wave, r.cursorId, startedAt, cfg);
    if (at && at > now) later.push({ r, at }); else now1.push(r);
  }
  for (let i = 0; i < later.length; i += 10) {
    await Promise.all(later.slice(i, i + 10).map(({ r, at }) => prisma.communicationCampaignDeferredRecipient.upsert({
      where: { campaignId_cursorId: { campaignId: campaign.id, cursorId: r.cursorId } },
      create: { campaignId: campaign.id, cursorId: r.cursorId, userId: r.userId, name: r.name, email: r.email, phone: r.phone, locale: r.locale, country: r.country, nextAttemptAt: at },
      update: {}, // a resumed walk never moves anyone's wave
    })));
  }
  return { ...plan, recipients: now1, eligible: now1.length, total: plan.total };
}

/**
 * Before releasing the next wave: if spam/reputation rejections in what was already sent reach
 * the configured rate, hold the remaining waves until a person releases the campaign.
 */
export async function stagedHold(campaign: CommunicationCampaign): Promise<{ hold: boolean; firstTime: boolean; ratePct: number; processed: number }> {
  const none = { hold: false, firstTime: false, ratePct: 0, processed: 0 };
  const cfg = stagedConfigFor(campaign);
  if (!cfg.enabled) return none;
  const doc = ((await prisma.$runCommandRaw({ find: STAGED_HOLD, filter: { _id: campaign.id }, limit: 1, maxTimeMS: 1000 } as Prisma.InputJsonObject)) as { cursor?: { firstBatch?: Record<string, unknown>[] } }).cursor?.firstBatch?.[0];
  if (doc?.releasedAt) return none;
  const base = { campaignId: campaign.id, channel: "EMAIL" };
  const [processed, spamCandidates] = await Promise.all([
    prisma.communicationDelivery.count({ where: { ...base, status: { in: PROCESSED } } }),
    prisma.communicationDelivery.findMany({
      where: { ...base, status: { in: ["FAILED", "BOUNCED"] }, OR: SPAM_WORDS.map((w) => ({ errorMessage: { contains: w, mode: "insensitive" as const } })) },
      select: { errorMessage: true }, take: 5000,
    }),
  ]);
  const spamBlocked = spamCandidates.filter((d) => isSpamBlock(d.errorMessage)).length;
  if (!shouldHold({ processed, spamBlocked, cfg })) return { ...none, processed };
  const ratePct = Math.round((spamBlocked / processed) * 1000) / 10;
  const res = (await prisma.$runCommandRaw({ update: STAGED_HOLD, updates: [{ q: { _id: campaign.id }, upsert: true,
    u: { $setOnInsert: { heldAt: new Date().toISOString(), ratePct, processed, spamBlocked } } }] } as Prisma.InputJsonObject)) as { upserted?: unknown[] };
  return { hold: true, firstTime: Array.isArray(res.upserted) && res.upserted.length > 0, ratePct, processed };
}
