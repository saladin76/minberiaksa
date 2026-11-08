/**
 * Safety contract for scheduled DONATION_LAPSED reminders.
 *
 * Only confirmed payments count as a donor's last gift. PAID can be set for a
 * new checkout or an unconfirmed bank transfer; paidAt is the settlement gate.
 *
 * Successful/reserved deliveries respect the configured (often 90-day)
 * reminder cooldown. Failed and skipped attempts use a shorter, bounded
 * retry backoff so a broken provider cannot trigger the same batch daily,
 * while delivery can resume after the underlying problem is fixed.
 *
 * Pure data and helpers: no database access, cron calls or message sends.
 */
export const SETTLED_DONATION_WHERE = {
  status: "PAID",
  paidAt: { not: null },
} as const;

export const REMINDER_SUCCESS_OR_RESERVED_STATUSES = [
  "DRAFT", "QUEUED", "RENDERED", "SENT_TO_PROVIDER", "SENT",
  "DELIVERED", "READ", "OPENED", "CLICKED", "REPLIED", "UNSUBSCRIBED",
] as const;

export const REMINDER_FAILED_OR_SKIPPED_STATUSES = [
  "FAILED", "SKIPPED",
] as const;

export const REMINDER_FAILED_RETRY_BACKOFF_DAYS = 7;

export function reminderFailureBackoffDays(cooldownDays: number): number {
  return Math.min(cooldownDays, REMINDER_FAILED_RETRY_BACKOFF_DAYS);
}

export function reminderPreviousAttemptWindows(cooldownCutoff: Date, failedCutoff: Date) {
  return [
    {
      status: { in: [...REMINDER_SUCCESS_OR_RESERVED_STATUSES] },
      createdAt: { gte: cooldownCutoff },
    },
    {
      status: { in: [...REMINDER_FAILED_OR_SKIPPED_STATUSES] },
      createdAt: { gte: failedCutoff },
    },
  ];
}
