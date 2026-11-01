import { prisma } from "@/lib/prisma";
import { fromWallClock } from "@/lib/donations/recurring-schedule";
export function searchReportWindow(period: { startDate: string; endDate: string }, timezone: string) {
  const midnight = (value: string, addDay = 0) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("INVALID_REPORT_DATE");
    const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + addDay);
    return fromWallClock({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 0, minute: 0, second: 0 }, timezone);
  };
  return { since: midnight(period.startDate), until: midnight(period.endDate, 1) };
}
/** Indexed server aggregation: only this plan's settled payments in the account's date window. */
export async function searchPlanRevenue(planId: string, { since, until }: { since: Date; until: Date }) {
  if (!/^[a-f0-9]{24}$/i.test(planId) || !Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || until <= since) throw new Error("INVALID_REPORT_SCOPE");
  const rows = await prisma.donation.aggregateRaw({ pipeline: [
    { $match: { status: "PAID", paidAt: { $gte: { $date: since.toISOString() }, $lt: { $date: until.toISOString() } }, "attribution.utm_campaign": `gs-${planId}` } },
    { $set: { reportUsd: { $cond: [
      { $and: [{ $isNumber: "$amountUSD" }, { $or: [{ $gt: ["$amountUSD",0] }, { $and: [{ $eq: ["$amount",0] },{ $eq: ["$amountUSD",0] }] }] }] }, "$amountUSD",
      { $cond: [{ $and: [{ $eq: ["$currency","USD"] },{ $isNumber: "$amount" }] }, "$amount", null] },
    ] } } },
    { $group: { _id: null, paid: { $sum: 1 }, missingFx: { $sum: { $cond: [{ $eq: ["$reportUsd",null] },1,0] } }, cents: { $sum: { $cond: [{ $eq: ["$reportUsd",null] },0,{ $floor: { $add: [{ $multiply: ["$reportUsd",100] },0.5] } }] } } } },
  ], options: { maxTimeMS: 15_000 } });
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("SEARCH_REVENUE_INVALID_RESULT");
  const value = rows[0] as {paid?: unknown; missingFx?: unknown; cents?: unknown} | undefined;
  const paid = value?.paid ?? 0, missingFx = value?.missingFx ?? 0, cents = value?.cents ?? 0;
  if (![paid,missingFx,cents].every(x => typeof x === "number" && Number.isSafeInteger(x)) || Number(paid) < 0 || Number(missingFx) < 0 || Number(missingFx) > Number(paid)) throw new Error("SEARCH_REVENUE_INVALID_RESULT");
  return { paid: Number(paid), revenueUSD: Number(cents)/100, missingFx: Number(missingFx), complete: true, since: since.toISOString(), until: until.toISOString() };
}
