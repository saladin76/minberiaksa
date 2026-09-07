import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { providerConnectionTestSchema } from "@/lib/integration-settings/api-contracts";
import { requireIntegrationSettingsTest } from "@/lib/integration-settings/auth";
import { integrationActorFromSession, integrationProviderFromParam, integrationSettingsErrorResponse } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsTest(session);
  if (denied) return denied;

  const provider = integrationProviderFromParam((await context.params).provider);
  if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  if (provider === "SYSTEM") return NextResponse.json({ error: "إعداد Cron من البنية التحتية ولا يملك تغييرات قابلة للاعتماد." }, { status: 400 });

  const parsed = providerConnectionTestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "طلب اختبار التغييرات لا يقبل بيانات إضافية." }, { status: 400 });

  try {
    const actor = integrationActorFromSession(session!);
    const snapshot = await integrationSettingsService.getProviderSnapshot(provider, actor);
    if (!snapshot.candidate.version || !snapshot.candidate.hasChanges) {
      return NextResponse.json({ error: "لا توجد تغييرات محفوظة تحتاج إلى اختبار.", code: "CANDIDATE_NOT_FOUND" }, { status: 409 });
    }
    return NextResponse.json(await integrationSettingsService.testProviderConnection(provider, actor));
  } catch (error) {
    return integrationSettingsErrorResponse(error);
  }
}
