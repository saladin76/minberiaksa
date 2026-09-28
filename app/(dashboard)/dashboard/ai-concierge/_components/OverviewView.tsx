"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowUpRight, BarChart3, Bot, Clock, Globe, HandCoins, Heart, Loader2, MessageSquare,
  MousePointerClick, PieChart as PieIcon, Repeat, Sparkles, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { MetricSummaryBand } from "@/components/dashboard/MetricSummaryBand";
import { StatsMetricCard } from "@/components/dashboard/StatsMetricCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CHART_SERIES, CHART_THEME, CHART_TOOLTIP_STYLE, seriesColor } from "@/lib/dashboard/chart-theme";
import { DEFAULT_PERIOD, PeriodPicker, periodLabel, periodParams, type Period } from "./PeriodPicker";
import { INTENT_LABELS, LOCALE_LABELS, ROUTE_LABELS, dateTime, label, num, pct, shortDate, usd } from "./labels";

type Overview = {
  windowDays: number;
  kpis: {
    conversations: number; engagedConversations: number; opened: number; userMessages: number; avgTurns: number;
    signedIn: number; needsHuman: number; fallbackTurns: number; modelTurns: number;
    directUSD: number; directCount: number; indirectUSD: number; indirectCount: number;
    totalUSD: number; totalCount: number; averageUSD: number; recurringCount: number;
    openToPaidRate: number; conversationToDonationRate: number;
  };
  daily: Array<{ date: string; conversations: number; messages: number; opened: number; directUSD: number; indirectUSD: number; directCount: number; indirectCount: number }>;
  funnel: Array<{ key: string; label: string; sessions: number }>;
  intents: Array<{ name: string; value: number }>;
  locales: Array<{ name: string; value: number }>;
  pages: Array<{ name: string; value: number }>;
  hours: Array<{ hour: number; conversations: number }>;
  topCampaigns: Array<{ id: string; title: string; shown: number; selected: number }>;
  attributionMix: Array<{ name: string; value: number; count: number }>;
  recentDonations: Array<{ id: string; kind: "direct" | "indirect"; via: string; usd: number; amount: number; currency: string; createdAt: string; donorName: string | null; recurring: boolean; sessionId: string | null }>;
};

const VIA_LABEL: Record<string, string> = { basket: "من السلة عبر المساعد", touch: "المتصفح نفسه لاحقًا", account: "حساب المتبرع لاحقًا" };

export function OverviewView() {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/ai/concierge/overview?${periodParams(period)}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error || "تعذّر التحميل");
        return json as Overview;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "تعذّر التحميل"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const k = data?.kpis;
  const funnelTop = Math.max(1, data?.funnel[0]?.sessions ?? 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
      </div>

      {error && <EmptyState icon={AlertTriangle} title="تعذّر تحميل التحليلات" description={error} />}

      {data && k && (
        <>
          <MetricSummaryBand
            icon={Wallet}
            eyebrow="تبرعات جاءت بفضل مساعد العطاء"
            badge={periodLabel(period)}
            value={usd(k.totalUSD)}
            note={`مباشر: التبرع أُضيف للسلة من داخل المساعد. غير مباشر: تحدّث الزائر مع المساعد ثم تبرّع خلال ${data.windowDays} أيام (من المتصفح نفسه أو من حسابه). يُحسب كل تبرع مرة واحدة.`}
            stats={[
              { label: "مباشر", icon: HandCoins, value: usd(k.directUSD), hint: `${num(k.directCount)} تبرع` },
              { label: "غير مباشر", icon: TrendingUp, value: usd(k.indirectUSD), hint: `${num(k.indirectCount)} تبرع` },
              { label: "المحادثات", icon: MessageSquare, value: num(k.conversations) },
              { label: "تحويل المحادثة لتبرع", icon: Target, value: pct(k.conversationToDonationRate) },
            ]}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
                <PieIcon className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold leading-tight text-slate-900">المؤشرات</h2>
                <p className="text-xs text-slate-500">محسوبة حسب الفترة المختارة</p>
              </div>
            </div>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <StatsMetricCard compact title="مرات فتح المساعد" value={k.opened} icon={MousePointerClick} accent="blue" subtitle="جلسات فتحت اللوحة" />
              <StatsMetricCard compact title="محادثات فعلية" value={k.engagedConversations} icon={MessageSquare} accent="indigo" subtitle={`من ${num(k.conversations)} محادثة`} />
              <StatsMetricCard compact title="رسائل كتبها الزوار" value={k.userMessages} icon={Users} accent="violet" subtitle={`متوسط ${k.avgTurns} دور لكل محادثة`} />
              <StatsMetricCard compact title="متوسط التبرع" value={k.averageUSD} format="money" icon={Heart} accent="emerald" />
              <StatsMetricCard compact title="تبرعات دورية" value={k.recurringCount} icon={Repeat} accent="teal" subtitle="من التبرعات المنسوبة" />
              <StatsMetricCard compact title="من فتح المساعد إلى الدفع" value={k.openToPaidRate * 100} format="percent" icon={Target} accent="orange" subtitle="مباشر فقط" />
              <StatsMetricCard compact title="تحتاج تدخل الفريق" value={k.needsHuman} icon={AlertTriangle} accent="rose" subtitle="أسئلة خارج معرفته أو شكاوى" />
              <StatsMetricCard compact title="ردود بدون النموذج" value={k.fallbackTurns} icon={Bot} accent="amber" subtitle={`مقابل ${num(k.modelTurns)} رد من الذكاء الاصطناعي`} />
            </div>
          </section>

          {k.conversations === 0 && k.opened === 0 ? (
            <EmptyState icon={Sparkles} title="لا توجد محادثات في هذه الفترة" description="تُسجَّل المحادثات بدءًا من تفعيل هذه الصفحة. جرّب فترة أطول أو افتح المساعد في الموقع." />
          ) : (
            <>
              <SectionCard title="المحادثات والتبرعات يوميًا" description="عدد المحادثات (خط) والتبرعات المنسوبة للمساعد بالدولار (أعمدة)" icon={BarChart3}>
                <div className="h-[340px] w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.daily} margin={{ top: 10, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: CHART_THEME.text, fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="usd" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={(v) => usd(Number(v))} />
                      <YAxis yAxisId="n" orientation="right" allowDecimals={false} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelFormatter={(v) => shortDate(String(v))}
                        formatter={(value: number, name: string) => [name.includes("$") ? usd(Number(value)) : num(Number(value)), name]}
                      />
                      <Legend />
                      <Bar yAxisId="usd" dataKey="directUSD" stackId="usd" name="مباشر $" fill={CHART_THEME.primary} radius={[0, 0, 0, 0]} maxBarSize={28} />
                      <Bar yAxisId="usd" dataKey="indirectUSD" stackId="usd" name="غير مباشر $" fill={CHART_THEME.primaryLight} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Line yAxisId="n" type="monotone" dataKey="conversations" name="محادثات" stroke={CHART_THEME.secondary} strokeWidth={2} dot={false} />
                      <Line yAxisId="n" type="monotone" dataKey="opened" name="مرات الفتح" stroke={CHART_SERIES[2]} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <div className="grid gap-6 lg:grid-cols-5">
                <SectionCard title="مسار التحويل" description="عدد الجلسات التي وصلت لكل خطوة" icon={Target} className="lg:col-span-3">
                  <div className="space-y-2.5">
                    {data.funnel.map((f, i) => {
                      const w = Math.max(2, (f.sessions / funnelTop) * 100);
                      const prev = i > 0 ? data.funnel[i - 1].sessions : 0;
                      return (
                        <div key={f.key}>
                          <div className="mb-1 flex items-center justify-between text-[12.5px]">
                            <span className="font-medium text-slate-700">{f.label}</span>
                            <span className="tabular-nums text-slate-500">
                              <b className="text-slate-900">{num(f.sessions)}</b>
                              {i > 0 && prev > 0 && <span className="ms-2 text-[11px] text-slate-400">({pct(f.sessions / prev)} من السابقة)</span>}
                            </span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${CHART_THEME.primary}, ${CHART_THEME.primaryLight})` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="مصدر التبرعات المنسوبة" description="بالدولار" icon={PieIcon} className="lg:col-span-2">
                  {k.totalCount === 0 ? (
                    <EmptyState variant="inline" icon={HandCoins} title="لا تبرعات منسوبة بعد في هذه الفترة" />
                  ) : (
                    <div className="h-[260px]" dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.attributionMix.filter((m) => m.value > 0)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                            {data.attributionMix.filter((m) => m.value > 0).map((_, i) => (
                              <Cell key={i} fill={seriesColor(i)} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => usd(Number(v))} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <BreakdownCard title="لماذا يأتي الزوار (النوايا)" icon={Sparkles} rows={data.intents.map((r) => ({ ...r, name: label(INTENT_LABELS, r.name) }))} />
                <BreakdownCard title="من أي صفحة فُتح المساعد" icon={ArrowUpRight} rows={data.pages.map((r) => ({ ...r, name: label(ROUTE_LABELS, r.name) }))} />
                <BreakdownCard title="لغات المحادثات" icon={Globe} rows={data.locales.map((r) => ({ ...r, name: label(LOCALE_LABELS, r.name) }))} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard title="المشاريع الأكثر ظهورًا واختيارًا" description="كم مرة اقترحها المساعد، وكم مرة اختارها الزائر" icon={Heart} flush>
                  {data.topCampaigns.length === 0 ? (
                    <EmptyState variant="inline" title="لا مشاريع بعد" />
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead className="bg-slate-50 text-[11.5px] text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-start font-medium">المشروع</th>
                          <th className="px-4 py-2 text-center font-medium">اقتُرح</th>
                          <th className="px-4 py-2 text-center font-medium">اختير</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.topCampaigns.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 text-slate-800">{c.title}</td>
                            <td className="px-4 py-2.5 text-center tabular-nums">{num(c.shown)}</td>
                            <td className="px-4 py-2.5 text-center tabular-nums font-semibold text-brand">{num(c.selected)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </SectionCard>

                <SectionCard title="أوقات النشاط" description="بداية المحادثات حسب الساعة (توقيت إسطنبول)" icon={Clock}>
                  <div className="h-[260px]" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.hours} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="cgHours" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_THEME.primary} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={CHART_THEME.primary} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} />
                        <XAxis dataKey="hour" tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickFormatter={(h) => `${h}:00`} interval={2} />
                        <YAxis allowDecimals={false} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(h) => `${h}:00`} formatter={(v: number) => [num(Number(v)), "محادثات"]} />
                        <Area type="monotone" dataKey="conversations" stroke={CHART_THEME.primary} strokeWidth={2} fill="url(#cgHours)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="آخر التبرعات المنسوبة للمساعد"
                icon={HandCoins}
                flush
                actions={
                  <Link href="/dashboard/ai-concierge/conversations?outcome=donated" className="text-xs font-medium text-brand hover:underline">
                    محادثات انتهت بتبرع ←
                  </Link>
                }
              >
                {data.recentDonations.length === 0 ? (
                  <EmptyState variant="inline" icon={HandCoins} title="لا تبرعات منسوبة في هذه الفترة" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-[13px]">
                      <thead className="bg-slate-50 text-[11.5px] text-slate-500">
                        <tr>
                          <th className="px-4 py-2 text-start font-medium">التاريخ</th>
                          <th className="px-4 py-2 text-start font-medium">المتبرع</th>
                          <th className="px-4 py-2 text-start font-medium">النوع</th>
                          <th className="px-4 py-2 text-start font-medium">المبلغ</th>
                          <th className="px-4 py-2 text-start font-medium">بالدولار</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recentDonations.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 text-slate-600">{dateTime(d.createdAt)}</td>
                            <td className="px-4 py-2.5 text-slate-800">{d.donorName ?? "—"}</td>
                            <td className="px-4 py-2.5">
                              <span className={d.kind === "direct" ? "rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand" : "rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700"}>
                                {d.kind === "direct" ? "مباشر" : "غير مباشر"}
                              </span>
                              <span className="ms-2 text-[11px] text-slate-400">{VIA_LABEL[d.via] ?? d.via}{d.recurring ? " · دوري" : ""}</span>
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">{d.amount.toLocaleString("en-US")} {d.currency}</td>
                            <td className="px-4 py-2.5 tabular-nums font-semibold text-slate-900">{usd(d.usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </>
      )}
    </div>
  );
}

function BreakdownCard({ title, icon, rows }: { title: string; icon: typeof Globe; rows: Array<{ name: string; value: number }> }) {
  const top = rows.slice(0, 8);
  return (
    <SectionCard title={title} icon={icon}>
      {top.length === 0 ? (
        <EmptyState variant="inline" title="لا بيانات" />
      ) : (
        <div className="h-[240px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: CHART_THEME.text, fontSize: 11 }} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => [num(Number(v)), "محادثات"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                {top.map((_, i) => (
                  <Cell key={i} fill={seriesColor(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
