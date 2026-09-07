import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { loadContextForDonation } from "@/lib/templates/variables";
import { pickLocale } from "@/lib/templates/locale-resolver";
import { donorChannelEligibility } from "@/lib/communication/audience-service";
import { resolveTriggerSendConfig, sendTriggerMessage } from "./dispatch";
import {
  DEFAULT_COOLDOWN_DAYS,
  DEFAULT_LAPSE_DAYS,
  MAX_COOLDOWN_DAYS,
  MAX_LAPSE_DAYS,
  MIN_COOLDOWN_DAYS,
  MIN_LAPSE_DAYS,
} from "./catalog";

/**
 * DONATION_LAPSED — the "donate again" re-engagement reminder.
 *
 * Unlike every other MessageTrigger event this one is NOT fired by a webhook: nothing happens in the
 * system when a donor goes quiet. It is evaluated on a schedule (daily, via
 * /api/cron/donation-reminders) by scanning every donor's most recent PAID donation and reminding the
 * ones whose last gift is older than the trigger's `lapseDays` (default 30 — "last donated last
 * month").
 *
 * Safety rules, in order:
 *   1. The trigger must exist and be `enabled` — the dashboard checkbox is the on/off switch.
 *   2. Donors with an active recurring subscription are never reminded (they are already giving).
 *   3. Marketing consent is enforced with the same `donorChannelEligibility` rules campaigns use
 *      (doNotContact / emailOptIn / emailNotifications / whatsappOptIn).
 *   4. A donor is reminded at most once per `cooldownDays`, and never twice for the same lapse —
 *      idempotency is read from CommunicationDelivery (the archive source of truth), so a re-run of
 *      the cron on the same day cannot double-send.
 *   5. Each run is bounded by `maxPerRun` so a first run over a large donor base cannot time out or
 *      blast the whole list at once; the remainder is picked up by the next run.
 */

export const DEFAULT_MAX_PER_RUN = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delivery statuses that mean "this donor was already reminded" — everything except dead ends. */
const REMINDER_COUNTED_STATUSES = ["DRAFT", "QUEUED", "RENDERED", "SENT_TO_PROVIDER", "SENT", "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED", "UNSUBSCRIBED"];

export type LapsedTriggerSummary = {
  triggerId: string;
  channel: string;
  templateId: string;
  lapseDays: number;
  cooldownDays: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
};

export type LapsedRunSummary = {
  ok: boolean;
  triggers: number;
  donorsScanned: number;
  sent: number;
  skipped: number;
  failed: number;
  truncated: boolean;
  dryRun: boolean;
  byTrigger: LapsedTriggerSummary[];
};

export function normalizeLapseDays(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LAPSE_DAYS;
  return Math.min(MAX_LAPSE_DAYS, Math.max(MIN_LAPSE_DAYS, Math.round(value)));
}

export function normalizeCooldownDays(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_COOLDOWN_DAYS;
  return Math.min(MAX_COOLDOWN_DAYS, Math.max(MIN_COOLDOWN_DAYS, Math.round(value)));
}

function bump(reasons: Record<string, number>, key: string) {
  reasons[key] = (reasons[key] ?? 0) + 1;
}

type DonorRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLang: string | null;
  emailNotifications: boolean;
  smsNotifications: boolean;
};

/**
 * Most recent PAID donation per donor. Uses `createdAt` (not `paidAt`) because legacy PAID rows
 * can have a null `paidAt` — the same rule `loadContext` uses for `{{totals.lastAt}}`.
 */
async function loadLastPaidDonationByDonor(): Promise<Map<string, { at: Date; donationId: string }>> {
  const grouped = await prisma.donation.groupBy({
    by: ["donorId"],
    where: { status: "PAID" },
    _max: { createdAt: true },
  });
  const out = new Map<string, { at: Date; donationId: string }>();
  for (const row of grouped) {
    if (row._max.createdAt) out.set(row.donorId, { at: row._max.createdAt, donationId: "" });
  }
  return out;
}

/** Resolve the actual last-donation ids for the donors we are about to remind (bounded batch). */
async function attachLastDonationIds(donorIds: string[], lastByDonor: Map<string, { at: Date; donationId: string }>): Promise<void> {
  if (!donorIds.length) return;
  const rows = await prisma.donation.findMany({
    where: { donorId: { in: donorIds }, status: "PAID" },
    select: { id: true, donorId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) {
    const entry = lastByDonor.get(row.donorId);
    if (entry && !entry.donationId) entry.donationId = row.id;
  }
}

export async function runDonationLapsedReminders(
  opts: { max?: number; dryRun?: boolean; now?: Date; actorRole?: string } = {}
): Promise<LapsedRunSummary> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const maxPerRun = Math.min(Math.max(opts.max ?? DEFAULT_MAX_PER_RUN, 1), 1000);
  const summary: LapsedRunSummary = { ok: true, triggers: 0, donorsScanned: 0, sent: 0, skipped: 0, failed: 0, truncated: false, dryRun, byTrigger: [] };

  if (!process.env.DATABASE_URL) return { ...summary, ok: false };

  const triggers = await prisma.messageTrigger.findMany({ where: { event: "DONATION_LAPSED", enabled: true }, orderBy: { createdAt: "asc" } });
  summary.triggers = triggers.length;
  if (!triggers.length) return summary;

  const lastByDonor = await loadLastPaidDonationByDonor();
  summary.donorsScanned = lastByDonor.size;
  if (!lastByDonor.size) return summary;

  // Donors with a live recurring subscription are already giving — never nag them.
  const activeSubscribers = new Set(
    (await prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { donorId: true } }).catch(() => [])).map((s) => s.donorId)
  );

  const config = await resolveTriggerSendConfig();
  let budget = maxPerRun;

  for (const trigger of triggers) {
    const lapseDays = normalizeLapseDays(trigger.lapseDays);
    const cooldownDays = normalizeCooldownDays(trigger.cooldownDays);
    const channel = trigger.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
    const row: LapsedTriggerSummary = { triggerId: trigger.id, channel, templateId: trigger.templateId, lapseDays, cooldownDays, candidates: 0, sent: 0, skipped: 0, failed: 0, reasons: {} };
    summary.byTrigger.push(row);

    const lapseCutoff = new Date(now.getTime() - lapseDays * DAY_MS);
    const cooldownCutoff = new Date(now.getTime() - cooldownDays * DAY_MS);

    // Most-recently-lapsed first: donors who just crossed the threshold convert best, and this keeps
    // the bounded run from getting permanently stuck on the oldest tail of the list.
    const candidateIds = [...lastByDonor.entries()]
      .filter(([donorId, last]) => last.at <= lapseCutoff && !activeSubscribers.has(donorId))
      .sort((a, b) => b[1].at.getTime() - a[1].at.getTime())
      .map(([donorId]) => donorId);
    row.candidates = candidateIds.length;
    if (!candidateIds.length) continue;

    // Only the head of the list can be reached within this run's budget — checking the whole donor
    // base would grow the `$in` without bound. The headroom keeps the run from stalling when most of
    // the head has already been reminded.
    const checkIds = candidateIds.slice(0, budget * 10 + 100);

    // Idempotency: anyone already reminded with this template since the cooldown cutoff is out.
    // CommunicationDelivery is the archive source of truth (SentMessage is only a best-effort mirror),
    // and the record is written BEFORE the provider call, so a crash mid-send can't cause a re-send.
    const priorDeliveries = await prisma.communicationDelivery.findMany({
      where: {
        templateId: trigger.templateId,
        origin: "TRIGGER",
        recipientUserId: { in: checkIds },
        status: { in: REMINDER_COUNTED_STATUSES },
        createdAt: { gte: cooldownCutoff },
      },
      select: { recipientUserId: true },
    }).catch(() => []);

    // The query is already bounded by cooldownCutoff, so anything it returns is a reminder inside the
    // cooldown window — that donor is out. Once the cooldown lapses they become a candidate again
    // (and if they donated in the meantime they simply stop being lapsed).
    const remindedRecently = new Set(priorDeliveries.map((d) => d.recipientUserId).filter(Boolean) as string[]);

    const eligibleIds: string[] = [];
    for (const donorId of checkIds) {
      if (remindedRecently.has(donorId)) {
        row.skipped += 1;
        summary.skipped += 1;
        bump(row.reasons, "ALREADY_REMINDED");
        continue;
      }
      eligibleIds.push(donorId);
    }
    if (!eligibleIds.length) continue;

    // Bound the work: only hydrate/send as many as the remaining budget allows.
    const batchIds = eligibleIds.slice(0, Math.max(budget, 0));
    if (eligibleIds.length > batchIds.length) summary.truncated = true;
    if (!batchIds.length) continue;

    const donors: DonorRow[] = await prisma.user.findMany({
      where: { id: { in: batchIds } },
      select: { id: true, name: true, email: true, phone: true, preferredLang: true, emailNotifications: true, smsNotifications: true },
    });
    const donorById = new Map(donors.map((d) => [d.id, d]));

    const profiles = await prisma.donorCommunicationProfile
      .findMany({ where: { userId: { in: batchIds } }, select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true } })
      .catch(() => []);
    const profileById = new Map(profiles.map((p) => [p.userId, p]));

    await attachLastDonationIds(batchIds, lastByDonor);

    for (const donorId of batchIds) {
      if (budget <= 0) { summary.truncated = true; break; }
      const donor = donorById.get(donorId);
      if (!donor) { row.skipped += 1; summary.skipped += 1; bump(row.reasons, "DONOR_NOT_FOUND"); continue; }

      // Re-engagement is marketing, not a receipt — consent is mandatory.
      const eligibility = donorChannelEligibility(
        { email: donor.email, phone: donor.phone, emailNotifications: donor.emailNotifications, smsNotifications: donor.smsNotifications },
        channel,
        profileById.get(donorId) ?? null
      );
      if (eligibility !== "ELIGIBLE") {
        row.skipped += 1;
        summary.skipped += 1;
        bump(row.reasons, eligibility === "NEEDS_REVIEW" ? "NEEDS_CONSENT_REVIEW" : "NOT_ELIGIBLE");
        continue;
      }

      const donationId = lastByDonor.get(donorId)?.donationId || "";
      if (!donationId) { row.skipped += 1; summary.skipped += 1; bump(row.reasons, "NO_LAST_DONATION"); continue; }

      if (dryRun) {
        row.sent += 1;
        summary.sent += 1;
        bump(row.reasons, "WOULD_SEND");
        budget -= 1;
        continue;
      }

      try {
        // Context is loaded from the last donation so the template can use {{donation.*}} —
        // "your last gift of $X on <date>" — alongside {{user.*}} and {{totals.*}}.
        const ctx = await loadContextForDonation(donationId);
        if (!ctx) { row.skipped += 1; summary.skipped += 1; bump(row.reasons, "NO_CONTEXT"); continue; }
        const locale = pickLocale({ recipientLang: ctx.user.preferredLang });
        const result = await sendTriggerMessage(trigger, ctx, { event: "DONATION_LAPSED", locale, config, donationId, purpose: "MARKETING" });
        if (!result) { row.skipped += 1; summary.skipped += 1; bump(row.reasons, "TEMPLATE_MISSING"); continue; }
        if (result.outcome === "SENT") { row.sent += 1; summary.sent += 1; bump(row.reasons, "SENT"); }
        else if (result.outcome === "FAILED") { row.failed += 1; summary.failed += 1; bump(row.reasons, result.reason ?? "FAILED"); }
        else { row.skipped += 1; summary.skipped += 1; bump(row.reasons, result.reason ?? "SKIPPED"); }
      } catch {
        row.failed += 1;
        summary.failed += 1;
        bump(row.reasons, "SEND_THREW");
      }
      budget -= 1;
    }
  }

  await writeAuditLog({
    actorRole: opts.actorRole ?? "SYSTEM",
    action: dryRun ? "DONATION_LAPSED_REMINDERS_PREVIEW" : "DONATION_LAPSED_REMINDERS_RUN",
    messageAr: dryRun
      ? `معاينة تذكير التبرّع — ${summary.sent} مرشّح للإرسال، ${summary.skipped} تخطّي`
      : `تذكير التبرّع مجددًا — ${summary.sent} أُرسل، ${summary.skipped} تخطّي${summary.failed ? `، ${summary.failed} فشل` : ""}`,
    messageEn: dryRun
      ? `Donation reminder preview — ${summary.sent} would send, ${summary.skipped} skipped`
      : `Donation reminders — sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}`,
    entityType: "MessageTrigger",
    metadata: { ...summary, externalCall: !dryRun && summary.sent > 0 },
    stream: "TEAM",
  }).catch(() => {});

  return summary;
}
