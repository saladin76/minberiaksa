import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { auditActorFromDashboardSession, writeAuditLog } from "@/lib/audit-log";
import {
  evaluateReadiness,
  isPlatformKey,
  type PlatformKey,
} from "@/lib/marketing/platform-connection-requirements";
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
  if (!isPlatformKey(existing.platform)) {
    return NextResponse.json({ error: "Stored platform unknown" }, { status: 500 });
  }
  const platform = existing.platform as PlatformKey;

  const readiness = evaluateReadiness(
    platform,
    existing as unknown as Record<string, unknown>,
    { enabled: true }
  );
  const updated = await prisma.marketingPlatformConnection.update({
    where: { id },
    data: { enabled: true, status: readiness.status },
  });
  const actor = auditActorFromDashboardSession(session!);
  await writeAuditLog({
    ...actor,
    action: "MARKETING_PLATFORM_CONNECTION_ENABLED",
    messageAr: `فعّل اتصال منصة: ${updated.name}`,
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
    status: readiness.status === "ACTIVE" ? "active" : readiness.status.toLowerCase(),
    message: readiness.nextStepMessage,
    connection: serializeConnection(updated),
  });
}
