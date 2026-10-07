import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import ConversionEventsPanel from "./_components/ConversionEventsPanel";

export const metadata = { title: "التتبع والتحويلات | لوحة التحكم" };
export const dynamic = "force-dynamic";

/**
 * Canonical read-only operational view for conversion delivery truth.
 * Tracking configuration lives under Platform Connections; this page answers what happened.
 */
export default async function MarketingTrackingPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "pixels");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <main className="p-4 sm:p-6" dir="rtl">
      <ConversionEventsPanel canRetry={userHasDashboardPermission(access.session.user, "platformConnectionsTest")} />
    </main>
  );
}
