import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import TrackingLinkBuilder from "./_components/TrackingLinkBuilder";
import CampaignLinksPanel from "./_components/CampaignLinksPanel";

export const metadata = { title: "الروابط والإسناد | لوحة التحكم" };
export const dynamic = "force-dynamic";

/**
 * Canonical owner of campaign-link creation and first-party attribution.
 * Legacy /link-generator and /marketing-intelligence/campaign-links routes redirect here.
 */
export default async function MarketingAttributionPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "referrals");
  if (!access.allowed) redirect(access.redirectTo);

  return (
    <main className="space-y-8 p-4 sm:p-6" dir="rtl">
      <section id="builder" className="rounded-2xl border border-slate-200 bg-white">
        <TrackingLinkBuilder />
      </section>
      <section id="links" className="rounded-2xl border border-slate-200 bg-white">
        <CampaignLinksPanel canExport={userHasDashboardPermission(access.session.user, "reportsExport")} />
      </section>
    </main>
  );
}
