import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import {
  reconcile,
  LIKELY_REASON_LABEL_AR,
  type ReconcileGroupBy,
} from "@/lib/marketing/reconcile";
import { computeMarketingRecommendations } from "@/lib/marketing/marketing-recommendations";

const VALID_GROUPBY: ReconcileGroupBy[] = [
  "platform",
  "campaign",
  "ad_group",
  "ad",
  "placement",
  "country",
  "channel",
];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // Reconcile is part of the ads dashboard story too — gate on either perm.
  const denied =
    requireAdminOrDashboardPermission(session, "platformConnections") &&
    requireAdminOrDashboardPermission(session, "ads");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const groupByRaw = (sp.get("groupBy") || "platform") as ReconcileGroupBy;
  const groupBy: ReconcileGroupBy = VALID_GROUPBY.includes(groupByRaw)
    ? groupByRaw
    : "platform";
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  if (!dateFrom || !dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "Invalid dateFrom/dateTo" }, { status: 400 });
  }
  const platform = sp.get("platform") ?? undefined;
  const connectionId = sp.get("connectionId") ?? undefined;

  const result = await reconcile({
    dateFrom,
    dateTo,
    groupBy,
    platform: platform || undefined,
    connectionId: connectionId || undefined,
  });
  const recommendations = computeMarketingRecommendations(result.rows);
  return NextResponse.json({
    ...result,
    likelyReasonLabels: LIKELY_REASON_LABEL_AR,
    recommendations,
  });
}
