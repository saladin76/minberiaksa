import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, CheckCircle2, CircleAlert, Layers3, Rocket, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { buildExecutiveSystemOverview, type ExecutiveRiskLevel } from "@/lib/executive/system-overview-service";

export const metadata = {
  title: "النظرة التنفيذية للنظام | لوحة التحكم",
};

// Live admin dashboard (per-request Prisma aggregation) — never statically prerendered.
export const dynamic = "force-dynamic";

const riskLabel: Record<ExecutiveRiskLevel, string> = {
  HIGH: "عالي",
  MEDIUM: "متوسط",
  LOW: "منخفض",
};

const riskClass: Record<ExecutiveRiskLevel, string> = {
  HIGH: "border-rose-200 bg-rose-50 text-rose-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-slate-200 bg-slate-50 text-slate-700",
};

async function getOverview() {
  const connections = await prisma.marketingPlatformConnection.findMany({
    orderBy: [
      { defaultForPlatform: "desc" },
      { category: "asc" },
      { platform: "asc" },
      { name: "asc" },
    ],
  });

  return buildExecutiveSystemOverview(connections);
}

export default async function ExecutiveSystemOverviewPage() {
  const overview = await getOverview();

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-2xl border bg-gradient-to-l from-slate-950 via-brand to-slate-900 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-white/70">Executive System Overview</p>
            <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight">النظرة التنفيذية للنظام</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/85">
              صفحة تجمع إشارات التسويق، التكاملات، المحتوى، الإنتاج، والأرشيف في لوحة واحدة للإدارة العليا.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/marketing/command-center"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-bold text-brand shadow-sm hover:bg-white/90"
            >
              قيادة التسويق
              <ArrowLeft className="h-4 w-4" />
            </Link>
            {/* «قيادة المحتوى» pointed at /dashboard/operations/command-center, removed with
                التشغيل. No successor page, so the CTA is gone rather than left to 404. */}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
        <SummaryCard title="إجراءات التسويق" value={overview.summary.marketingActions} icon={<BarChart3 className="h-5 w-5" />} />
        <SummaryCard title="إجراءات المحتوى" value={overview.summary.operationsActions} icon={<Layers3 className="h-5 w-5" />} />
        <SummaryCard title="تكاملات جاهزة" value={overview.summary.providerReady} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard title="تكاملات تحتاج عمل" value={overview.summary.providerNeedsWork} icon={<CircleAlert className="h-5 w-5" />} />
        <SummaryCard title="مهام محجوبة" value={overview.summary.blockedTasks} icon={<ShieldCheck className="h-5 w-5" />} />
        <SummaryCard title="إنتاج جاهز" value={overview.summary.productionReady} icon={<Rocket className="h-5 w-5" />} />
        <SummaryCard title="الإيراد" value={overview.summary.totalRevenue.toLocaleString("ar-EG")} icon={<TrendingUp className="h-5 w-5" />} />
        <SummaryCard title="ROAS" value={`${overview.summary.averageRoas}x`} icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>أهم المخاطر والفرص</CardTitle>
            <CardDescription>
              قائمة مختصرة مبنية على مراكز القيادة الحالية لتحديد ما يحتاج قرارًا إداريًا سريعًا.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.risks.length > 0 ? (
              overview.risks.map((risk, index) => (
                <div key={risk.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                          {index + 1}
                        </span>
                        <h2 className="font-black text-slate-900">{risk.title}</h2>
                        <Badge variant="outline" className={riskClass[risk.level]}>
                          مستوى {riskLabel[risk.level]}
                        </Badge>
                      </div>
                      <p className="max-w-3xl text-sm leading-6 text-slate-600">{risk.reason}</p>
                    </div>
                    <Link
                      href={risk.href}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold text-brand hover:bg-slate-50"
                    >
                      فتح التفاصيل
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">
                لا توجد مخاطر تشغيلية بارزة الآن. تابع المراكز التنفيذية بشكل دوري.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>مراكز القيادة</CardTitle>
              <CardDescription>روابط مباشرة للأنظمة التنفيذية.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* مركز قيادة المحتوى and لوحة الإنتاج both lived under /dashboard/operations and
                  went with التشغيل; neither has a successor. */}
              <QuickLink href="/dashboard/marketing/command-center" title="مركز قيادة التسويق" icon={<BarChart3 className="h-4 w-4" />} />
              <QuickLink href="/dashboard/marketing/connections/catalog" title="صحة التكاملات" icon={<CheckCircle2 className="h-4 w-4" />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قاعدة الأمان</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-6 text-slate-600">
              <p>هذه الصفحة تجميعية فقط ولا تنفذ مزامنة أو نشر أو API خارجي.</p>
              <p>تقرأ من خدمات النظام الحالية، وتحولها إلى مؤشرات ومخاطر للإدارة.</p>
              <p>لا تعرض أسرارًا، ولا تغيّر الدفع أو التتبع الحي.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon }: { title: string; value: string | number; icon: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        <span className="text-brand">{icon}</span>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, title, icon }: { href: string; title: string; icon: ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl border bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">
      <span className="flex items-center gap-2">
        <span className="text-brand">{icon}</span>
        {title}
      </span>
      <ArrowLeft className="h-4 w-4 text-slate-400" />
    </Link>
  );
}
