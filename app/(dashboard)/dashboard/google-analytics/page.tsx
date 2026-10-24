import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { dashDir, dt } from "@/lib/dashboard/i18n";
import GoogleAnalyticsDashboard from "./_components/GoogleAnalyticsDashboard";

export const metadata = { get title() { return dt("تحليلات Google Analytics | لوحة التحكم"); } };
export const dynamic = "force-dynamic";

export default async function GoogleAnalyticsPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "platformConnections");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <main className="space-y-5 p-4 sm:p-6" dir={dashDir()}>
      <GoogleAnalyticsDashboard />
    </main>
  );
}
