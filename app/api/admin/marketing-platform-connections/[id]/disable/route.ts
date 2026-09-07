import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import { redactSecretsFromMetadata } from "@/lib/marketing/secrets";
import { serializeConnection } from "@/lib/marketing/connection-serializer";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.marketingPlatformConnection.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.marketingPlatformConnection.update({
    where: { id },
    data: { enabled: false, status: "DISABLED" },
  });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "MARKETING_PLATFORM_CONNECTION_DISABLED",
    messageAr: `أوقف اتصال منصة: ${updated.name}`,
    entityType: "MarketingPlatformConnection",
    entityId: updated.id,
    metadata: redactSecretsFromMetadata({
      connectionId: updated.id,
      platform: updated.platform,
      category: updated.category,
      status: updated.status,
    }),
    stream: "TEAM",
  });
  return NextResponse.json({
    ok: true,
    status: "disabled",
    message: "تم إيقاف الاتصال.",
    connection: serializeConnection(updated),
  });
}
