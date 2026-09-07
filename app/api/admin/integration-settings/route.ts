import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { INTEGRATION_PROVIDERS } from "@/lib/integration-settings/catalog";
import { requireIntegrationSettingsView } from "@/lib/integration-settings/auth";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";
import { integrationActorFromSession } from "@/lib/integration-settings/http";
import { withActiveTestState } from "@/lib/integration-settings/safe-snapshot";

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireIntegrationSettingsView(session);
  if (denied) return denied;
  const actor = integrationActorFromSession(session!);
  const providers = await Promise.all(INTEGRATION_PROVIDERS.map(async (provider) => {
    const snapshot = await integrationSettingsService.getProviderSnapshot(provider, actor);
    return withActiveTestState(snapshot);
  }));
  return NextResponse.json({ providers });
}
