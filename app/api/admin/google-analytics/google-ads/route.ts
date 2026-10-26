import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { parseGa4Period } from "@/lib/marketing/ga4-period";
import { fetchGoogleAdsReport, GoogleAdsReportError } from "@/lib/marketing/google-ads-report";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: NextRequest) {
  const denied = requireAdminOrDashboardPermission(await getServerSession(authOptions), "platformConnections");
  if (denied) return denied;
  const parameters = request.nextUrl.searchParams;
  let period;
  try { period = parseGa4Period(Object.fromEntries(parameters)); } catch { return json({ error: "GA4_PERIOD_INVALID" }, 400); }
  try {
    const connections = await prisma.marketingPlatformConnection.findMany({ where: { platform: "GOOGLE_ADS", enabled: true }, orderBy: { defaultForPlatform: "desc" }, take: 2 });
    if (connections.length > 1 && !connections[0].defaultForPlatform) return json({ error: "GOOGLE_ADS_DEFAULT_REQUIRED" }, 409);
    const connection = connections[0];
    const env = process.env;
    const credentials = connection ? { customerId: connection.accountId || "", developerToken: connection.developerToken || "", clientId: connection.appId || "", clientSecret: connection.clientSecret || "", refreshToken: connection.refreshToken || "", managerId: connection.managerAccountId || "" } : { customerId: env.GOOGLE_ADS_CUSTOMER_ID || "", developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || "", clientId: env.GOOGLE_ADS_CLIENT_ID || "", clientSecret: env.GOOGLE_ADS_CLIENT_SECRET || "", refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN || "", managerId: env.GOOGLE_ADS_MANAGER_ID || "" };
    if (!credentials.customerId) return json({ error: "GOOGLE_ADS_CONFIG_MISSING" }, 409);
    return json(await fetchGoogleAdsReport({ ...credentials, version: env.GOOGLE_ADS_API_VERSION || "v26" }, period));
  } catch (failure) { return json({ error: failure instanceof GoogleAdsReportError ? failure.code : "GOOGLE_ADS_REPORT_FAILED" }, failure instanceof GoogleAdsReportError ? failure.status : 502); }
}
