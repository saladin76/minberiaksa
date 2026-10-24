import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import TrackingLinkBuilder from "./_components/TrackingLinkBuilder";
import CampaignLinksPanel from "./_components/CampaignLinksPanel";
import { Link2, PlusCircle, ChartNoAxesCombined } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
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
        title={dt("الروابط والإسناد")}
        description={dt("أنشئ روابط حملات موحدة، ثم راقب التبرعات والإيراد الذي أمكن مطابقته معها من بيانات الموقع.")}
        icon={Link2}
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" asChild><a href="#builder"><PlusCircle className="me-2 h-4 w-4" />{dt("إنشاء رابط")}</a></Button>
            <Button variant="outline" asChild><a href="#links"><ChartNoAxesCombined className="me-2 h-4 w-4" />{dt("متابعة الأداء")}</a></Button>
          </div>
        )}
      />
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-sm leading-6 text-sky-950">
        {dt("المؤشرات هنا مبنية على التبرعات المسجلة داخل الموقع والمطابقة لمعرّفات UTM والحملات. لا تمثل زيارات أو إنفاقًا مستوردًا من منصات الإعلان.")}
      </div>
      <section id="builder" aria-label={dt("إنشاء رابط حملة")} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white">
        <TrackingLinkBuilder />
      </section>
      <section id="links" aria-label={dt("تحليل روابط الحملات")} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white">
        <CampaignLinksPanel canExport={userHasDashboardPermission(access.session.user, "reportsExport")} />
      </section>
    </main>
  );
}
