import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { continueSearchPlanning } from "@/lib/marketing/google-search/planner";
import { optimizeSearchPlan } from "@/lib/marketing/google-search/optimizer";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  if (!isCronAuthorizationValid(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const planning = await prisma.googleSearchPlan.findMany({ where: { status: "PLANNING" }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 2 });
  for (const plan of planning) await continueSearchPlanning(plan.id);
  const optimization = await prisma.googleSearchPlan.findMany({ where: { status: "ACTIVE", automationEnabled: true, OR: [{ lastReviewAt: null }, { lastReviewAt: { lte: new Date(Date.now() - 6 * 3600000) } }] }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 2 });
  for (const plan of optimization) await optimizeSearchPlan(plan.id);
  return NextResponse.json({ ok: true, planningSteps: planning.length, optimizationReviews: optimization.length });
}
