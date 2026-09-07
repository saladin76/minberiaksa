import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireIntegrationSettingsTest } from "@/lib/integration-settings/auth";
import { cronInfrastructureStatus, isCronAuthorizationValid } from "@/lib/communication/cron-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsTest(session);
  if (denied) return denied;

  const status = cronInfrastructureStatus();
  const authorizationValid = status.secretConfigured
    ? isCronAuthorizationValid(`Bearer ${process.env.CRON_SECRET}`)
    : false;

  return NextResponse.json({
    success: status.secretValid && authorizationValid,
    secretConfigured: status.secretConfigured,
    routeProtected: status.routeProtected && authorizationValid,
    messageAr: status.secretValid && authorizationValid
      ? "حماية Route الجدولة سليمة، ولم يتم تشغيل أي حملة."
      : "مفتاح Cron غير مضبوط أو لا يحقق متطلبات الأمان.",
    failureCode: status.secretValid && authorizationValid ? null : status.secretConfigured ? "CRON_SECRET_INVALID" : "CRON_SECRET_MISSING",
  });
}
