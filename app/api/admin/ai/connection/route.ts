import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireIntegrationSettingsView, requireIntegrationSettingsManage, requireIntegrationSettingsTest } from "@/lib/integration-settings/auth";
import { auditActorFromDashboardSession, queueAuditLog } from "@/lib/audit-log";
import { AiConnectionError } from "@/lib/ai/core/connection-config";
import { getAiConnectionConfig } from "@/lib/ai/core/connection-settings";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) { return json({ ok: false, error: error instanceof AiConnectionError ? error.code : "AI_SETTINGS_UNAVAILABLE" }, error instanceof AiConnectionError ? error.status : 503); }
async function body(request: NextRequest) {
  const text = await request.text();
  if (text.length > 4096) throw new AiConnectionError("AI_SETTINGS_INVALID");
  try { return JSON.parse(text); } catch { throw new AiConnectionError("AI_SETTINGS_INVALID"); }
}
export async function GET() {
  const denied = requireIntegrationSettingsView(await getServerSession(authOptions)); if (denied) return denied;
  try { return json({ ok: true, settings: await (await getAiConnectionConfig()).snapshot() }); } catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsManage(session); if (denied) return denied;
  try {
    const settings = await (await getAiConnectionConfig()).save(await body(request));
    queueAuditLog({ ...auditActorFromDashboardSession(session!), action: "AI_CONNECTION_SAVED", entityType: "AiConnectionSettings", entityId: "site-openai", messageAr: "حفظ اتصال الذكاء الاصطناعي للموقع", metadata: { enabled: settings.enabled, model: settings.model, keyPresent: settings.keyPresent } });
    return json({ ok: true, settings });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsTest(session); if (denied) return denied;
  try {
    const input = await body(request);
    // Testing a new secret/model also requires permission to manage that configuration.
    if (input?.apiKey || input?.model !== undefined) { const manageDenied = requireIntegrationSettingsManage(session); if (manageDenied) return manageDenied; }
    const result = await (await getAiConnectionConfig()).test(input);
    return json({ ok: true, result });
  } catch (error) { return failure(error); }
}
