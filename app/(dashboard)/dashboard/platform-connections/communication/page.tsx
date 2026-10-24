import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { PageHeader } from "../_components/ui";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { INTEGRATION_PROVIDERS } from "@/lib/integration-settings/catalog";
import { integrationSettingsService } from "@/lib/integration-settings/prisma-service";
import { integrationActorFromSession } from "@/lib/integration-settings/http";
import { resolveCommunicationConnectionsPageAccess } from "@/lib/integration-settings/page-access";
import { withActiveTestState } from "@/lib/integration-settings/safe-snapshot";
import { getSchedulerStatus } from "@/lib/communication/scheduler-status";
import { IntegrationSettingsManager } from "./_components/IntegrationSettingsManager";
import { SenderRoutingManager } from "./_components/SenderRoutingManager";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import Link from "next/link";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { get title() { return dt("مزودو التواصل والإرسال | ربط المنصات والإرسال"); } };
export const dynamic = "force-dynamic";

export default async function CommunicationConnectionsPage() {
  const access = resolveCommunicationConnectionsPageAccess(
    await getServerSession(authOptions),
  );

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const session = access.session;
  const user = session.user;
  const permissions = {
    canView: true,
    canTest: userHasDashboardPermission(user, "platformConnectionsTest"),
    canManage: userHasDashboardPermission(user, "platformConnectionsManage"),
    canAdmin: userHasDashboardPermission(user, "platformConnectionsAdmin"),
  };
  const actor = integrationActorFromSession(session);
  const [initialProviders, scheduler] = await Promise.all([
    Promise.all(INTEGRATION_PROVIDERS.map(async (provider) => withActiveTestState(await integrationSettingsService.getProviderSnapshot(provider, actor)))),
    getSchedulerStatus(),
  ]);

  return (
    // Same gutters as the sibling health/tracking pages  this one had none, so
    // the section's three pages sat at different insets.
    <main className="space-y-4 p-4 sm:p-6" dir={dashDir()}>
      <PageHeader
        eyebrow={dt("ربط المنصات والإرسال / المزودون")}
        title={dt("مزودو التواصل والإرسال")}
        subtitle={dt("إدارة بيانات واتساب والإيميل والرسائل القصيرة من مكان واحد، مع فصل فحص التكوين العامل عن اختبار التغييرات قبل اعتمادها.")}
        actions={(
          <Button variant="outline" asChild>
            <Link href="/dashboard/platform-connections/health">
              <Activity className="me-2 h-4 w-4" />{dt("فحص صحة الاتصالات")}
            </Link>
          </Button>
        )}
      />
      <IntegrationSettingsManager initialProviders={initialProviders} permissions={permissions} scheduler={scheduler} />
      {/* Senders and routing sit with the providers because they are the same question one level up:
          the provider says HOW a message leaves, the sender says which of our numbers it leaves from.
          Kept behind the manage permission  repointing a sender changes what donors see. */}
      {permissions.canManage && <SenderRoutingManager />}
    </main>
  );
}
