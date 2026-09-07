import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { getRecommendationOverview } from "@/lib/ai/recommendations/recommendation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only: rule-based marketing recommendations computed from real campaign results.
 * Only MARKETING-area items are surfaced for the marketing decision center.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const overview = await getRecommendationOverview();
  const recommendations = overview.recommendations
    .filter((r) => r.area === "MARKETING")
    .slice(0, 6)
    .map((r) => ({ id: r.id, type: r.type, title: r.title, reason: r.reason, action: r.suggestedAction, confidence: r.confidence, priority: r.priority }));

  return NextResponse.json({ ok: true, recommendations }, { headers: { "Cache-Control": "no-store" } });
}
