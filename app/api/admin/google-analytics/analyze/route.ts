import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";
import { getOpenAiProviderStatus } from "@/lib/ai/core/openai-provider";
import { parseGa4Period } from "@/lib/marketing/ga4-period";
import { loadGa4DashboardReport, Ga4ReportError } from "@/lib/marketing/ga4-server";
import { analyzeGa4Report } from "@/lib/marketing/ga4-analysis";
import { isValidLocale } from "@/lib/locales";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections"); if (denied) return denied;
  const body = await request.json().catch(() => null);
  let period;
  try { period = parseGa4Period(body ?? {}); } catch { return NextResponse.json({ error: "GA4_PERIOD_INVALID" }, { status: 400 }); }
  const provider = getOpenAiProviderStatus();
  if (provider.mode !== "ready" || !process.env.OPENAI_API_KEY || !provider.model) return NextResponse.json({ error: "GA4_ANALYSIS_NOT_CONFIGURED" }, { status: 503 });
  try {
    const data = await loadGa4DashboardReport(period);
    const result = await analyzeGa4Report({ report: data.report, period, locale: isValidLocale(body?.locale) ? body.locale : "ar", model: provider.model, baseUrl: provider.baseUrl, apiKey: process.env.OPENAI_API_KEY });
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "GA4_ANALYSIS", entityType: "GoogleAnalytics", entityId: data.propertyId, messageAr: "تحليل بيانات زيارات الموقع", metadata: { period, evidenceCount: result.evidence.length } });
    return NextResponse.json({ ...result, period, reportUpdatedAt: data.updatedAt, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Ga4ReportError ? error.message : "GA4_ANALYSIS_FAILED" }, { status: error instanceof Ga4ReportError ? error.status : 502 }); }
}
