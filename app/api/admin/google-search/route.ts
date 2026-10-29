import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { NOT_SOFT_DELETED } from "@/lib/campaign/soft-delete-filter";
import { searchCredentials, credentialsReady, SearchApiError } from "@/lib/marketing/google-search/client";
import { searchPlanRequest } from "@/lib/marketing/google-search/contracts";
import { runAfterResponse } from "@/lib/events/after-response";
import { prepareSearchPlan, continueSearchPlanning } from "@/lib/marketing/google-search/planner";
import { executeSearchPlan } from "@/lib/marketing/google-search/executor";
import { fetchGoogleAdsReport } from "@/lib/marketing/google-ads-report";
import { searchPlanRevenue, searchReportWindow } from "@/lib/marketing/google-search/revenue";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "platformConnections"); if (denied) return denied;
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (id) {
      if (!/^[a-f0-9]{24}$/i.test(id)) return response({ error: "INVALID_PLAN_ID" }, 400);
      const plan = await prisma.googleSearchPlan.findUnique({ where: { id } });
      if (!plan) return response({ error: "PLAN_NOT_FOUND" }, 404);
      if (request.nextUrl.searchParams.get("report") === "1") {
        const connection = await prisma.marketingPlatformConnection.findFirst({ where: { id: plan.connectionId, platform: "GOOGLE_ADS", enabled: true } });
        if (!connection) return response({ error: "ACCOUNT_NOT_AVAILABLE" }, 409);
        const report = await fetchGoogleAdsReport(searchCredentials(connection), { range: "28d" }, fetch, new Date(), `Minber ${plan.id} | `);
        const ledger = await searchPlanRevenue(plan.id, searchReportWindow(report.period, report.timezone));
        return response({ report, ledger });
      }
      return response({ plan });
    }
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (connectionId && !/^[a-f0-9]{24}$/i.test(connectionId)) return response({ error: "INVALID_ACCOUNT_ID" }, 400);
    const [accounts, projects, plans] = await Promise.all([
      prisma.marketingPlatformConnection.findMany({ where: { platform: "GOOGLE_ADS" }, orderBy: { name: "asc" } }),
      prisma.campaign.findMany({ where: { isActive: true, ...NOT_SOFT_DELETED }, select: { id: true, title: true, slug: true, translations: { select: { locale: true, title: true, slug: true } } }, orderBy: { priority: "asc" }, take: 1000 }),
      prisma.googleSearchPlan.findMany({ ...(connectionId ? { where: { connectionId } } : {}), orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, status: true, connectionId: true, version: true, automationEnabled: true, createdAt: true } }),
    ]);
    return response({ accounts: accounts.map(row => ({ id: row.id, name: row.name, customerId: row.accountId, enabled: row.enabled, ready: credentialsReady(searchCredentials(row)) })), projects, plans, projectLimitReached: projects.length === 1000 });
  } catch { return response({ error: "SEARCH_DATA_UNAVAILABLE" }, 502); }
}
const actionSchema = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i), version: z.number().int().positive(), action: z.enum(["validate", "create", "enable", "pause", "budget", "automation", "reconcile"]), confirmation: z.string().optional(), dailyBudget: z.number().positive().max(1e6).optional(), newDailyBudget: z.number().positive().max(1e6).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), policy: z.object({ enabled: z.boolean(), maxKeywordCost: z.number().positive().max(1e6), minClicks: z.number().int().min(10).max(10000) }).strict().optional() }).strict();
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnectionsManage"); if (denied) return denied;
  try {
    const body = await request.json(), actor = auditActorFromDashboardSession(session!);
    if (body.action === "resume-planning") {
      const parsed = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i), version: z.number().int().positive() }).parse(body);
      const resumed = await prisma.googleSearchPlan.updateMany({ where: { id: parsed.id, version: parsed.version, status: "PLANNING_FAILED" }, data: { status: "PLANNING", lastError: null, version: { increment: 1 } } });
      if (resumed.count !== 1) return response({ error: "PLAN_CHANGED_RELOAD" }, 409);
      runAfterResponse(() => continueSearchPlanning(parsed.id));
      return response({ plan: await prisma.googleSearchPlan.findUniqueOrThrow({ where: { id: parsed.id } }) });
    }
    const plan = body.action === "plan" ? await prepareSearchPlan(searchPlanRequest.parse(body.request), actor.actorId || "admin") : await executeSearchPlan(actionSchema.parse(body));
    queueAuditLog({ ...actor, action: `GOOGLE_SEARCH_${String(body.action).toUpperCase()}`, entityType: "GoogleSearchPlan", entityId: plan.id, messageAr: `إدارة Google Search: ${body.action} — ${plan.title}`, metadata: { version: plan.version, status: plan.status, connectionId: plan.connectionId } });
    if (body.action === "plan") runAfterResponse(async () => { for (let step = 0; step < 2; step++) await continueSearchPlanning(plan.id); });
    return response({ plan });
  } catch (error) {
    if (error instanceof z.ZodError) return response({ error: "SEARCH_INPUT_INVALID", issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, 400);
    if (error instanceof SearchApiError) return response({ error: error.code, uncertain: error.uncertain }, error.status);
    const code = error instanceof Error && /^[A-Z0-9_:]+$/.test(error.message) ? error.message : "SEARCH_OPERATION_FAILED";
    return response({ error: code }, 409);
  }
}
