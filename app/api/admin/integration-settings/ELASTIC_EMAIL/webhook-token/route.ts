import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireIntegrationSettingsManage } from "@/lib/integration-settings/auth";
import { buildElasticEmailWebhookUrl, generateWebhookToken } from "@/lib/integration-settings/provider-webhook";
import { integrationActorFromSession, integrationSettingsErrorResponse } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsManage(session);
  if (denied) return denied;

  try {
    const token = generateWebhookToken();
    const result = await integrationSettingsService.saveProviderSettings(
      "ELASTIC_EMAIL",
      [{ key: "WEBHOOK_SECRET", value: token }],
      integrationActorFromSession(session!)
    );
    return NextResponse.json({
      ok: true,
      webhookUrl: buildElasticEmailWebhookUrl(token),
      candidateVersion: result.snapshot.candidate.version,
      message: "انسخ الرابط الآن وأضفه داخل Elastic Email ضمن Settings → Notifications. لن يظهر رمز الحماية كاملًا مرة أخرى.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CANONICAL_URL_MISSING") {
      return NextResponse.json({ error: "تعذر تحديد النطاق الرسمي للموقع من إعدادات السيرفر.", code: "CANONICAL_URL_MISSING" }, { status: 500 });
    }
    return integrationSettingsErrorResponse(error);
  }
}
