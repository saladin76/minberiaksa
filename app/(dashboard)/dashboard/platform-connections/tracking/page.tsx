import Link from "next/link";
import { getTrackingReadiness } from "@/lib/platform-connections/readiness";
import { PageHeader, Card, CardHeader, StatusBadge } from "../_components/ui";

export const metadata = { title: "بكسلات التتبع | ربط المنصات والإرسال" };
export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  const { rows, configuredCount, total } = await getTrackingReadiness();

  return (
    <main className="space-y-5" dir="rtl">
      <PageHeader
        eyebrow="ربط المنصات والإرسال / بكسلات التتبع"
        title="بكسلات التتبع"
        subtitle="جاهزية بكسلات وواجهات التتبع كما هي مضبوطة حاليًا. هذه الصفحة للعرض فقط — لا تغيّر إطلاق الأحداث أو السكربتات."
      />

      <Card>
        <CardHeader title="حالة البكسلات" description={`${configuredCount} من ${total} مُعدّة. التتبع الفعلي والأحداث تُدار كما هي دون تغيير.`} />
        <div className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3 text-right">المنصة</th>
                  <th className="p-3 text-center">مُعدّ؟</th>
                  <th className="p-3 text-center">المتصفح</th>
                  <th className="p-3 text-center">السيرفر</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-left">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b last:border-0">
                    <td className="p-3 font-bold text-slate-800">{r.label}</td>
                    <td className="p-3 text-center">{r.configured ? "نعم" : "لا"}</td>
                    <td className="p-3 text-center text-slate-500">{r.browser ? "✓" : "—"}</td>
                    <td className="p-3 text-center text-slate-500">{r.server ? "✓" : "—"}</td>
                    <td className="p-3 text-center"><StatusBadge status={r.status} /></td>
                    <td className="p-3 text-left">
                      <div className="flex justify-end gap-3 text-xs font-bold text-brand">
                        <Link href="/dashboard/pixels" className="hover:underline">فتح الإعدادات</Link>
                        <Link href="/dashboard/conversion-events" className="hover:underline">عرض الأحداث</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <p className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500">
        تُدار قيم البكسلات ورموز التتبع من <Link href="/dashboard/pixels" className="font-bold text-brand hover:underline">صفحة إعدادات البكسلات</Link>. لا تُعرض أي مفاتيح أو رموز سرية هنا.
      </p>
    </main>
  );
}
