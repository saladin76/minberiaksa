/**
 * Ramadan scheduling results for the dashboard, as a pure aggregation over plans and their
 * donations (the API route reads them; this file is tested without a database).
 */
export type StatsPlan = { id: string; status: string; hasCard: boolean; createdAt: Date; donorId: string | null; scheduleRule: unknown };
export type StatsDonation = { subscriptionId: string | null; status: string; amountUSD: number | null };
export type RamadanStats = {
  confirmed: number; awaitingCard: number; stopped: number; ended: number; donors: number;
  scheduledTotal: number; collected: number; failedCharges: number;
  perDay: number[]; slot: { fajr: number; maghrib: number }; intent: { self: number; parents: number; other: number };
  projects: { id: string; total: number }[];
};

type Rule = { days?: { day: number; amount: number }[]; slot?: string; intent?: string; projectIds?: string[] };
const asRule = (value: unknown): Rule => (value && typeof value === "object" ? (value as Rule) : {});

export function ramadanStats(plans: StatsPlan[], donations: StatsDonation[]): RamadanStats {
  const confirmedPlans = plans.filter((p) => p.hasCard && p.status === "ACTIVE");
  const perDay = Array.from({ length: 30 }, () => 0);
  const slot = { fajr: 0, maghrib: 0 }, intent = { self: 0, parents: 0, other: 0 };
  const projects = new Map<string, number>();
  let scheduledTotal = 0;
  for (const plan of confirmedPlans) {
    const rule = asRule(plan.scheduleRule), days = Array.isArray(rule.days) ? rule.days : [];
    const ids = Array.isArray(rule.projectIds) && rule.projectIds.length ? rule.projectIds : [];
    for (const d of days) {
      if (!Number.isInteger(d?.day) || d.day < 1 || d.day > 30 || !Number.isFinite(d.amount)) continue;
      perDay[d.day - 1] += d.amount; scheduledTotal += d.amount;
      for (const id of ids) projects.set(id, (projects.get(id) ?? 0) + d.amount / ids.length);
    }
    if (rule.slot === "fajr") slot.fajr += 1; else slot.maghrib += 1;
    if (rule.intent === "parents") intent.parents += 1; else if (rule.intent === "other") intent.other += 1; else intent.self += 1;
  }
  const ids = new Set(plans.map((p) => p.id));
  const mine = donations.filter((d) => d.subscriptionId && ids.has(d.subscriptionId));
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    confirmed: confirmedPlans.length,
    awaitingCard: plans.filter((p) => !p.hasCard && p.status === "ACTIVE").length,
    stopped: plans.filter((p) => p.status === "PAYMENT_FAILED").length,
    ended: plans.filter((p) => p.status === "CANCELLED" && p.hasCard).length,
    donors: new Set(confirmedPlans.map((p) => p.donorId).filter(Boolean)).size,
    scheduledTotal: round(scheduledTotal),
    collected: round(mine.filter((d) => d.status === "PAID").reduce((s, d) => s + (d.amountUSD ?? 0), 0)),
    failedCharges: mine.filter((d) => d.status === "FAILED").length,
    perDay: perDay.map(round), slot, intent,
    projects: [...projects].map(([id, total]) => ({ id, total: round(total) })).sort((a, b) => b.total - a.total),
  };
}
