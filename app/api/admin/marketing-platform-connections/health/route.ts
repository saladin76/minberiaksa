import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { serializeConnection } from "@/lib/marketing/connection-serializer";
import { buildProviderHealthOverview } from "@/lib/marketing/integrations/provider-health-service";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const rows = await prisma.marketingPlatformConnection.findMany({
    orderBy: [
      { defaultForPlatform: "desc" },
      { category: "asc" },
      { platform: "asc" },
      { name: "asc" },
    ],
  });

  const connections = rows.map(serializeConnection);
  const overview = buildProviderHealthOverview(connections);

  return NextResponse.json(overview);
}
