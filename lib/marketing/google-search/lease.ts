import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const SEARCH_PLAN_LEASE_MS = 10 * 60_000;
export const freeSearchPlanLease = (now = new Date()) => ({ OR: [{ workLeaseUntil: null }, { workLeaseUntil: { isSet: false as const } }, { workLeaseUntil: { lte: now } }] });

/** All provider-changing workers share this lease. Emergency stop deliberately bypasses it. */
export async function withPlanLease<T>(plan: { id: string; version: number; status: string }, fn: (token: string) => Promise<T>): Promise<T> {
  const token = randomUUID(), now = new Date();
  const claimed = await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, version: plan.version, status: plan.status, ...freeSearchPlanLease(now) },
    data: { workLeaseToken: token, workLeaseUntil: new Date(now.getTime() + SEARCH_PLAN_LEASE_MS) } });
  if (claimed.count !== 1) throw new Error("PROVIDER_OPERATION_IN_PROGRESS");
  try { return await fn(token); }
  finally { await prisma.googleSearchPlan.updateMany({ where: { id: plan.id, workLeaseToken: token }, data: { workLeaseToken: null, workLeaseUntil: null } }); }
}
