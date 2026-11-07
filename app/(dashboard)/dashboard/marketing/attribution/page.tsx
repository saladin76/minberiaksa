import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import AttributionWorkspace from "./_components/AttributionWorkspace";
import { Link2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { dashDir, dt } from "@/lib/dashboard/i18n";

export const metadata = { get title() { return dt("الروابط والإسناد | لوحة التحكم"); } };
export const dynamic = "force-dynamic";

/**
 * Canonical owner of campaign-link creation and first-party attribution.
 * Legacy /link-generator and /marketing-intelligence/campaign-links routes redirect here.
 */
export default async function MarketingAttributionPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "referrals");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <main className="space-y-8 p-4 sm:p-6" dir={dashDir()}>
      <PageHeader
        eyebrow={dt("التسويق / الإحالات")}
        title={dt("روابط الحملات")}
        description={dt("أنشئ رابطًا لحملتك، ثم تابع التبرعات المرتبطة به في مكان واحد.")}
        icon={Link2}

      />
      <AttributionWorkspace canExport={userHasDashboardPermission(access.session.user, "reportsExport")} />
    </main>
  );
}

