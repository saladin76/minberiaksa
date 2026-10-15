import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveDashboardPageAccess } from "@/lib/dashboard/page-access";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { getTrackingReadiness } from "@/lib/platform-connections/readiness";
import { PageHeader, Card, CardHeader, StatusBadge } from "../_components/ui";
import TrackingSettingsManager from "./_components/TrackingSettingsManager";
import { dashDir, dt } from "@/lib/dashboard/i18n";

export const metadata = { get title() { return dt("بكسلات التتبع | ربط المنصات والإرسال"); } };
export const dynamic = "force-dynamic";

/**
 * Canonical owner of pixel/tag/server-conversion configuration.
 * Marketing > Tracking is intentionally read-only operational truth; configuration lives here.
 */
export default async function TrackingPage() {
  const access = resolveDashboardPageAccess(await getServerSession(authOptions), "platformConnections");
  if (!access.allowed) redirect(access.redirectTo);

  const { rows, configuredCount, total } = await getTrackingReadiness();
  const canManage = userHasDashboardPermission(access.session.user, "platformConnectionsManage");
  const canTest = userHasDashboardPermission(access.session.user, "platformConnectionsTest");

  return (
    <main className="space-y-5 p-4 sm:p-6" dir={dashDir()}>
      <PageHeader
        eyebrow={dt("ربط المنصات والإرسال / بكسلات التتبع")}
        title={dt("بكسلات التتبع")}
        subtitle={dt("إعداد البكسلات وواجهات التحويل من مكان واحد. نتائج الأحداث الفعلية تُراجع من صفحة التتبع والتحويلات.")}
        actions={
          <Link
            href="/dashboard/marketing/tracking"
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-brand hover:bg-slate-50"
          >
            {dt("فتح سجل التحويلات")}</Link>
        }
      />

      <Card>
        <CardHeader
          title={dt("جاهزية التتبع")}
          description={dt("{0} من {1} مكوّنات مُعدّة. «مُعدّ» يعني وجود الإعداد، وليس إثبات وصول التحويل إلى المنصة.", [configuredCount, total])}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-3 text-start">{dt("المنصة")}</th>
                <th className="p-3 text-center">{dt("مُعدّ؟")}</th>
                <th className="p-3 text-center">{dt("المتصفح")}</th>
                <th className="p-3 text-center">{dt("السيرفر")}</th>
                <th className="p-3 text-center">{dt("الحالة")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="p-3 font-bold text-slate-800">{row.label}</td>
                  <td className="p-3 text-center">{row.configured ? dt("نعم") : dt("لا")}</td>
                  <td className="p-3 text-center text-slate-500">{row.browser ? "✓" : "—"}</td>
                  <td className="p-3 text-center text-slate-500">{row.server ? "✓" : "—"}</td>
                  <td className="p-3 text-center"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage || canTest ? (
        <TrackingSettingsManager canManage={canManage} canTest={canTest} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {dt("لديك صلاحية عرض حالة الربط فقط. تعديل البكسلات والمفاتيح يحتاج صلاحية «ربط المنصات: حفظ وتفعيل الإعدادات».")}</div>
      )}
    </main>
  );
}
