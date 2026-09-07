import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireIntegrationSettingsAdmin, requireIntegrationSettingsManage, requireIntegrationSettingsView } from "@/lib/integration-settings/auth";
import {
  integrationProviderActionSchema,
  integrationSettingDeleteSchema,
  integrationSettingsUpdateSchema,
} from "@/lib/integration-settings/api-contracts";
import { integrationActorFromSession, integrationProviderFromParam, integrationSettingsErrorResponse } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";
import { withActiveTestState } from "@/lib/integration-settings/safe-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };
async function resolveProvider(context: RouteContext) { return integrationProviderFromParam((await context.params).provider); }
function cronReadOnly(provider: string) {
  return provider === "SYSTEM" ? NextResponse.json({ error: "مفتاح Cron يُدار من إعدادات البنية التحتية داخل Vercel فقط.", code: "CRON_INFRASTRUCTURE_ONLY" }, { status: 400 }) : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsView(session); if (denied) return denied;
  const provider = await resolveProvider(context); if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  try {
    const snapshot = await integrationSettingsService.getProviderSnapshot(provider, integrationActorFromSession(session!));
    return NextResponse.json({ provider: await withActiveTestState(snapshot) });
  } catch (error) { return integrationSettingsErrorResponse(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsManage(session); if (denied) return denied;
  const provider = await resolveProvider(context); if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  const blocked = cronReadOnly(provider); if (blocked) return blocked;
  const parsed = integrationSettingsUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "بيانات الإعدادات غير صالحة." }, { status: 400 });
  try {
    const result = await integrationSettingsService.saveProviderSettings(provider, parsed.data.settings, integrationActorFromSession(session!));
    return NextResponse.json({ ok: true, ...result, snapshot: await withActiveTestState(result.snapshot) });
  } catch (error) { return integrationSettingsErrorResponse(error); }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsAdmin(session); if (denied) return denied;
  const provider = await resolveProvider(context); if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  const blocked = cronReadOnly(provider); if (blocked) return blocked;
  const parsed = integrationSettingDeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "حذف الإعداد يحتاج تأكيدًا صريحًا." }, { status: 400 });
  try {
    const snapshot = await integrationSettingsService.deleteSetting(provider, parsed.data.key, integrationActorFromSession(session!));
    return NextResponse.json({ ok: true, provider: await withActiveTestState(snapshot) });
  } catch (error) { return integrationSettingsErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsAdmin(session); if (denied) return denied;
  const provider = await resolveProvider(context); if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  const blocked = cronReadOnly(provider); if (blocked) return blocked;
  const parsed = integrationProviderActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "إجراء المزود غير صالح." }, { status: 400 });
  try {
    const snapshot = await integrationSettingsService.setProviderEnabled(provider, parsed.data.action === "ENABLE", integrationActorFromSession(session!));
    return NextResponse.json({ ok: true, provider: await withActiveTestState(snapshot) });
  } catch (error) { return integrationSettingsErrorResponse(error); }
}
