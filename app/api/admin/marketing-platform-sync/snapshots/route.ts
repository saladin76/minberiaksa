import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Snapshot availability summary — for the Sync tab. One row per connection
 * with counts of stored snapshots and the most recent date observed.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const connections = await prisma.marketingPlatformConnection.findMany({
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      platform: true,
      accountId: true,
      lastSyncAt: true,
    },
  });

  // Pull per-connection counts in parallel — small N (number of connections).
  const summaries = await Promise.all(
    connections.map(async (c) => {
      const [campaigns, adGroups, ads, messaging, lastCampaign, lastMessaging] = await Promise.all([
        prisma.adCampaignSnapshot.count({ where: { connectionId: c.id } }),
        prisma.adGroupSnapshot.count({ where: { connectionId: c.id } }),
        prisma.adSnapshot.count({ where: { connectionId: c.id } }),
        prisma.marketingCampaignSnapshot.count({ where: { connectionId: c.id } }),
        prisma.adCampaignSnapshot.findFirst({
          where: { connectionId: c.id },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
        prisma.marketingCampaignSnapshot.findFirst({
          where: { connectionId: c.id },
          orderBy: { date: "desc" },
          select: { date: true },
        }),
      ]);
      return {
        connectionId: c.id,
        connectionName: c.name,
        platform: c.platform,
        accountId: c.accountId,
        lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
        snapshots: {
          campaigns,
          adGroups,
          ads,
          messaging,
          lastCampaignDate: lastCampaign?.date ? lastCampaign.date.toISOString() : null,
          lastMessagingDate: lastMessaging?.date ? lastMessaging.date.toISOString() : null,
        },
      };
    })
  );

  return NextResponse.json({ summaries });
}
