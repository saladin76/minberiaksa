import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { JWT } from "google-auth-library";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { decryptIntegrationSecret } from "@/lib/integration-settings/crypto";
import { getRawTrackingSettings, trackingString } from "@/lib/tracking/tracking-settings";
import { Ga4ApiError, fetchGa4DashboardReport, isGa4Range, parseGa4ServiceAccountJson } from "@/lib/marketing/ga4-reporting";

export const dynamic = "force-dynamic";

const SERVICE_ACCOUNT_CONTEXT = "tracking-settings:ga4-service-account";
const cache = new Map<string, { expiresAt: number; report: Awaited<ReturnType<typeof fetchGa4DashboardReport>> }>();

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const requestedRange = request.nextUrl.searchParams.get("range");
  const range = isGa4Range(requestedRange) ? requestedRange : "28d";

  try {
    const settings = await getRawTrackingSettings();
    const propertyId = trackingString(settings, "gaPropertyId") || process.env.GA4_PROPERTY_ID?.trim();
    if (!propertyId) return jsonError("GA4_PROPERTY_MISSING", 409);
    if (!/^\d{4,20}$/.test(propertyId)) return jsonError("GA4_PROPERTY_INVALID", 409);

    let serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim() ?? "";
    const encrypted = trackingString(settings, "gaServiceAccountEncrypted");
    if (encrypted) {
      try {
        serviceAccountJson = decryptIntegrationSecret(encrypted, SERVICE_ACCOUNT_CONTEXT);
      } catch {
        return jsonError("GA4_CREDENTIALS_UNREADABLE", 503);
      }
    }
    if (!serviceAccountJson) return jsonError("GA4_CREDENTIALS_MISSING", 409);
    const serviceAccount = parseGa4ServiceAccountJson(serviceAccountJson);
    if (!serviceAccount) return jsonError("GA4_CREDENTIALS_INVALID", 409);

    const key = `${propertyId}:${range}`;
    const cached = cache.get(key);
    const forceRefresh = request.nextUrl.searchParams.has("refresh");
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ propertyId, range, updatedAt: new Date(cached.expiresAt - 5 * 60_000).toISOString(), report: cached.report, cached: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    let accessToken: string | null | undefined;
    try {
      const auth = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
      });
      ({ token: accessToken } = await auth.getAccessToken());
    } catch {
      return jsonError("GA4_AUTHENTICATION_FAILED", 502);
    }
    if (!accessToken) return jsonError("GA4_AUTHENTICATION_FAILED", 502);

    const report = await fetchGa4DashboardReport({ propertyId, accessToken, range });
    const updatedAt = new Date();
    if (cache.size >= 20 && !cache.has(key)) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { expiresAt: updatedAt.getTime() + 5 * 60_000, report });
    return NextResponse.json({ propertyId, range, updatedAt: updatedAt.toISOString(), report, cached: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Ga4ApiError) {
      if (error.status === 401 || error.status === 403) return jsonError("GA4_ACCESS_DENIED", 403);
      if (error.status === 429) return jsonError("GA4_QUOTA_EXCEEDED", 429);
      return jsonError("GA4_REPORT_FAILED", 502);
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return jsonError("GA4_REPORT_TIMEOUT", 504);
    }
    return jsonError("GA4_REPORT_FAILED", 502);
  }
}
