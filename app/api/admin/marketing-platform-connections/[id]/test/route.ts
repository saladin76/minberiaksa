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

interface TwilioApiSurface {
  api?: {
    v2010?: {
      accounts?: (sid: string) => { fetch: () => Promise<unknown> };
    };
  };
}

/**
 * Test a connection's readiness. Always non-throwing — returns one of:
 *   - status: "active"           — required fields present, lightweight check passed
 *   - status: "missing_config"   — required fields missing (guidance returned)
 *   - status: "not_implemented"  — platform-specific live check not wired yet
 *   - status: "auth_error"       — Twilio auth check rejected the credentials
 *   - status: "sync_error"       — Twilio reachable but returned an error
 *
 * Currently only Twilio has a live check (a fetch of the account record). All
 * other platforms return `not_implemented` when the required fields are in
 * place. No real message is sent.
 */
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
    return NextResponse.json({ error: "Stored platform unknown" }, { status: 500 });
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

  // Twilio: lightweight account-record fetch.
  if (platform === "TWILIO" && row.accountId && row.authToken) {
    try {
      const twilioMod = await import("twilio");
      const client = (twilioMod.default ?? twilioMod)(row.accountId, row.authToken);
      const accounts =
        (client as unknown as TwilioApiSurface).api?.v2010?.accounts;
      if (!accounts) {
        await persistTestResult({
          id,
          status: "NOT_IMPLEMENTED",
          error: "Twilio SDK lacks api.v2010.accounts",
          tested: true,
        });
        await auditTest(session!, row, "not_implemented", readiness);
        return NextResponse.json({
          ok: false,
          status: "not_implemented",
          message: "نسخة Twilio SDK لا توفر فحص الحساب — لا يمكن إجراء اختبار مباشر.",
        });
      }
      await accounts(row.accountId).fetch();
      await persistTestResult({ id, status: "ACTIVE", error: null, tested: true });
      await auditTest(session!, row, "active", readiness);
      return NextResponse.json({
        ok: true,
        status: "active",
        message: "تم التحقق من حساب Twilio بنجاح.",
        completionPercent: readiness.completionPercent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth = /20003|401|auth/i.test(message);
      await persistTestResult({
        id,
        status: isAuth ? "AUTH_ERROR" : "SYNC_ERROR",
        error: message.slice(0, 240),
        tested: true,
      });
      await auditTest(
        session!,
        row,
        isAuth ? "auth_error" : "sync_error",
        readiness
      );
      return NextResponse.json({
        ok: false,
        status: isAuth ? "auth_error" : "sync_error",
        message: isAuth
          ? "Auth Token غير صحيح — راجع TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN."
          : `فشل الاتصال بـ Twilio: ${message.slice(0, 160)}`,
      });
    }
  }

  // Other platforms: not implemented yet — readiness checks pass but no
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
      "الاختبار المباشر لهذه المنصة سيُفعَّل لاحقًا — جميع الحقول المطلوبة مكتملة.",
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
    messageAr: `اختبر اتصال منصة: ${row.name} — ${outcome}`,
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

