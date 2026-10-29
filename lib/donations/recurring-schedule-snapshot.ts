import { recurringReadiness, type BillingReadiness, type RecurringPlanReadinessInput } from "./recurring-readiness";

/** Read-only: no repair, plan activation or payment request occurs here. */
export function recurringScheduleSnapshot(now = new Date()) {
  const counts: Partial<Record<BillingReadiness, number>> = {};
  let nextScheduledAt: string | null = null, earliestOverdueAt: string | null = null, next24Hours = 0;
  return {
    add(plan: RecurringPlanReadinessInput) {
      const state = recurringReadiness(plan, now); counts[state] = (counts[state] || 0) + 1;
      if (state === "scheduled" || state === "due") {
        const at = plan.nextBillingDate!.toISOString();
        if (state === "scheduled") {
          if (!nextScheduledAt || at < nextScheduledAt) nextScheduledAt = at;
          if (plan.nextBillingDate!.getTime() <= now.getTime() + 86_400_000) next24Hours++;
        } else if (!earliestOverdueAt || at < earliestOverdueAt) earliestOverdueAt = at;
      }
      return state;
    },
    result() { return { counts: { ...counts }, nextScheduledAt, earliestOverdueAt, next24Hours }; },
  };
}
export type RecurringScheduleSnapshot = ReturnType<ReturnType<typeof recurringScheduleSnapshot>["result"]>;
