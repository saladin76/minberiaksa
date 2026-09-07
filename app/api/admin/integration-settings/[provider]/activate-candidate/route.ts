import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { providerCandidateActivationSchema } from "@/lib/integration-settings/api-contracts";
import { requireIntegrationSettingsManage } from "@/lib/integration-settings/auth";
import { integrationActorFromSession, integrationProviderFromParam, integrationSettingsErrorResponse } from "@/lib/integration-settings/http";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsManage(session);
  if (denied) return denied;
  const provider = integrationProviderFromParam((await context.params).provider);
  if (!provider) return NextResponse.json({ error: "مزود غير معروف." }, { status: 404 });
  const parsed = providerCandidateActivationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "إصدار التكوين المرشح غير صالح." }, { status: 400 });
  try {
    const snapshot = await integrationSettingsService.activateProviderCandidate(provider, parsed.data.candidateVersion, integrationActorFromSession(session!));
    return NextResponse.json({ ok: true, provider: snapshot });
  } catch (error) {
    return integrationSettingsErrorResponse(error);
  }
}
