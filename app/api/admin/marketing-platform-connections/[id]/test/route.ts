import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
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

/** Readiness check. No messages, charges or advertising mutations. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "platformConnections");
  if (denied) return denied;

  const { id } = await params;
  const row = await prisma.marketingPlatformConnection.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isPlatformKey(row.platform)) {
    return NextResponse.json({ error: "Stored platform unknown" }, { status: 410 });
  }
  const platform = row.platform as PlatformKey;
  const readiness = evaluateReadiness(platform, row as unknown as Record<string, unknown>, {
    enabled: row.enabled,
  });

  if (readiness.missingRequiredFields.length > 0) {
    await persistTestResult({
      id,
      status: "MISSING_CONFIG",
      error: null,
      tested: true,
    });
    await auditTest(session!, row, "missing_config", readiness);
    return NextResponse.json({
      ok: false,
      status: "missing_config",
      message: readiness.nextStepMessage,
      missingRequiredFields: readiness.missingRequiredFields,
      missingOptionalFields: readiness.missingOptionalFields,
      completionPercent: readiness.completionPercent,
      guidance: readiness.guidance,
    });
  }

  // Other platforms: not implemented yet  readiness checks pass but no
  // live API call is made in this phase.
  await persistTestResult({
    id,
    status: "NOT_IMPLEMENTED",
    error: null,
    tested: true,
  });
  await auditTest(session!, row, "not_implemented", readiness);
  return NextResponse.json({
    ok: true,
    status: "not_implemented",
    message:
      "الاختبار المباشر لهذه المنصة سيُفعَّل لاحقًا  جميع الحقول المطلوبة مكتملة.",
    completionPercent: readiness.completionPercent,
  });
}

async function persistTestResult(opts: {
  id: string;
  status: string;
  error: string | null;
  tested: boolean;
}) {
  const data: Prisma.MarketingPlatformConnectionUncheckedUpdateInput = {
    status: opts.status,
    lastError: opts.error,
  };
  if (opts.tested) data.lastTestAt = new Date();
  await prisma.marketingPlatformConnection.update({
    where: { id: opts.id },
    data,
  });
}

async function auditTest(
  session: Session,
  row: { id: string; name: string; platform: string; category: string },
  outcome: string,
  readiness: ReturnType<typeof evaluateReadiness>
) {
  const actor = auditActorFromDashboardSession(session);
  await writeAuditLog({
    ...actor,
    action: "MARKETING_PLATFORM_CONNECTION_TESTED",
    messageAr: `اختبر اتصال منصة: ${row.name}  ${outcome}`,
    entityType: "MarketingPlatformConnection",
    entityId: row.id,
    metadata: redactSecretsFromMetadata({
      connectionId: row.id,
      platform: row.platform,
      category: row.category,
      outcome,
      completionPercent: readiness.completionPercent,
      missingRequiredFields: readiness.missingRequiredFields,
    }),
    stream: "TEAM",
  });
}

