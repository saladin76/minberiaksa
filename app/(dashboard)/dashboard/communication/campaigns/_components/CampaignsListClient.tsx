"use client";

import * as React from "react";
import Link from "next/link";
import { readDashboardJson } from "@/lib/dashboard/read-json";
import { readCampaignOutcomes } from "@/lib/dashboard/read-campaign-outcomes";
import { CampaignGlobalControlsDialog } from "./CampaignGlobalControlsDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Megaphone, Plus, RefreshCw, Send, Eye, MousePointerClick, HandHeart, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignsTable, sortCampaigns, type CampaignSort } from "./CampaignsTable";
import { type CampaignRow, CHANNEL_META, STATUS_META } from "./campaign-ui";
import { dashDir, dt, dtx } from "@/lib/dashboard/i18n";

export function CampaignsListClient() {
  const [campaigns, setCampaigns] = React.useState<CampaignRow[]>([]);
  const [unattributed, setUnattributed] = React.useState({ donationCount: 0, revenue: 0, unpricedPaidCount: 0 });
  const [loadError, setLoadError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [outcomesReady, setOutcomesReady] = React.useState(false);
  const [outcomeError, setOutcomeError] = React.useState(false);
  const [deliveryError, setDeliveryError] = React.useState(false);
  const activeRead = React.useRef<AbortController | null>(null);
  const [search, setSearch] = React.useState("");
  const [channel, setChannel] = React.useState("all");
  const [status, setStatus] = React.useState("active");
  // Newest first: the campaign someone came here to check is almost always the one just sent.
  const [sort, setSort] = React.useState<CampaignSort>({ key: "date", dir: "desc" });

  // Re-clicking the active column flips direction; a new column starts descending, which is the
  // useful default for every column here (most recent, most sent, most failed).
  const toggleSort = React.useCallback((key: CampaignSort["key"]) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }, []);

  const load = React.useCallback(async () => {
    activeRead.current?.abort();
    const controller = new AbortController(); activeRead.current = controller;
    const current = () => activeRead.current === controller && !controller.signal.aborted;
    setLoading(true); setLoadError(false); setOutcomeError(false); setOutcomesReady(false);
    let listLoaded = false;
    try {
      const base = await readDashboardJson<{ campaigns: CampaignRow[]; deliveryCountersReady?: boolean }>("/api/communication/campaigns?includeArchived=true&includeOutcomes=false", controller.signal);
      if (!current()) return;
      if (!Array.isArray(base.campaigns)) throw new Error("INVALID_CAMPAIGN_LIST");
      setCampaigns(base.campaigns.map(row => ({ ...row, donationCount: null, revenue: null, unpricedPaidCount: null })));
      setDeliveryError(base.deliveryCountersReady === false);
      setHasLoaded(true); setLoading(false); listLoaded = true;
      if (!base.campaigns.length) { setUnattributed({donationCount:0,revenue:0,unpricedPaidCount:0}); setOutcomesReady(true); return; }
      const report = await readCampaignOutcomes<{ outcomesReady: boolean; campaigns: CampaignRow[]; unattributed: typeof unattributed }>("/api/communication/campaigns?includeArchived=true&outcomesMode=poll", controller.signal);
      if (!current()) return;
      if (!Array.isArray(report.campaigns) || !report.unattributed) throw new Error("INVALID_CAMPAIGN_REPORT");
      // A slower financial report must not replace current send/retry counters
      // with the campaign's older persisted snapshot.
      setCampaigns(current => report.campaigns.map(row => ({ ...row, ...current.find(live => live.id === row.id), donationCount: row.donationCount, revenue: row.revenue, unpricedPaidCount: row.unpricedPaidCount, trackingRequiresTemplateUpdate: row.trackingRequiresTemplateUpdate, failedDonationCount: row.failedDonationCount })));
      setUnattributed(report.unattributed); setOutcomesReady(true);
    } catch {
      if (!current()) return;
      if (listLoaded) setOutcomeError(true);
      else setLoadError(true);
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    return () => activeRead.current?.abort();
  }, [load]);

  // Filtered and sorted client-side: the service caps the list at 200 rows, so this is a small
  // in-memory set and a round trip per keystroke or column click would buy nothing.
  const filtered = sortCampaigns(
    campaigns.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (status === "active" && c.status === "ARCHIVED") return false;
      if (status === "archived" && c.status !== "ARCHIVED") return false;
      if (!["all", "active", "archived"].includes(status) && c.status !== status) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    sort,
  );

  const byChannel = (id: string) => campaigns.filter((c) => c.channel === id).length;

  const analytics = React.useMemo(() => {
    return filtered.reduce(
      (acc, campaign) => {
        acc.sent += campaign.sentCount;
        acc.engaged += Math.max(campaign.readCount, campaign.clickedCount, campaign.repliedCount);
        acc.clicked += campaign.clickedCount;
        acc.donations += campaign.donationCount ?? 0;
        acc.revenue += campaign.revenue ?? 0;
        acc.unpriced += campaign.unpricedPaidCount ?? 0;
        return acc;
      },
      { sent: 0, engaged: 0, clicked: 0, donations: 0, revenue: 0, unpriced: 0 },
    );
  }, [filtered]);

  const engagementRate = analytics.sent > 0 ? Math.round((analytics.engaged / analytics.sent) * 1000) / 10 : 0;
  const clickRate = analytics.sent > 0 ? Math.round((analytics.clicked / analytics.sent) * 1000) / 10 : 0;

  return (
    <div dir={dashDir()}>
      {deliveryError ? <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{dt("تعذّر تحديث إحصاءات الإرسال؛ الأرقام المعروضة هي آخر نسخة محفوظة. اضغط تحديث لإعادة المحاولة.")}</p> : null}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={dt("ابحث باسم الحملة…")}
        actions={
          <>
            <CampaignGlobalControlsDialog />
            <Button aria-label={dt("تحديث")} variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">{dt("تحديث")}</span>
            </Button>
            <Button size="sm" className="gap-1.5 bg-brand hover:bg-brand/90" asChild>
              <Link href="/dashboard/communication/campaigns/new">
                <Plus className="h-4 w-4" />
                {dt("حملة جديدة")}</Link>
            </Button>
          </>
        }
      >
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger aria-label={dt("تصفية بالقناة")} className="h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">{dt("كل القنوات")}</SelectItem>
            {Object.entries(CHANNEL_META).map(([id, m]) => (
              <SelectItem key={id} value={id} className="text-xs">
                {m.label} ({byChannel(id)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label={dt("تصفية بالحالة")} className="h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active" className="text-xs">{dt("الحملات النشطة")}</SelectItem>
            <SelectItem value="archived" className="text-xs">
              {dt("المؤرشفة (")}{campaigns.filter((c) => c.status === "ARCHIVED").length})
            </SelectItem>
            <SelectItem value="all" className="text-xs">{dt("كل الحالات")}</SelectItem>
            {Object.entries(STATUS_META)
              .filter(([id]) => id !== "ARCHIVED")
              .map(([id, m]) => (
                <SelectItem key={id} value={id} className="text-xs">{m.label}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {loadError && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p>{dt("تعذّر تحميل الحملات. البيانات السابقة قد تكون قديمة؛ أعد المحاولة.")}</p><Button variant="outline" size="sm" onClick={load}>{dt("إعادة المحاولة")}</Button></div>}
      {hasLoaded && !outcomesReady && !outcomeError && !loadError && <p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{dt("الحملات ظاهرة؛ جارٍ تحميل الإيرادات المؤكدة.")}</p>}
      {outcomeError && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{dt("تعذّر تحميل إسناد الإيرادات؛ بيانات الحملات متاحة والمبالغ غير متاحة مؤقتًا.")}</p><Button variant="outline" size="sm" onClick={load}>{dt("إعادة المحاولة")}</Button></div>}
      {outcomesReady && !loadError && filtered.some(campaign => campaign.trackingRequiresTemplateUpdate) && <p role="status" className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900">{dt("توجد قوالب واتساب بروابط ثابتة مشتركة. يلزم اعتماد زر ديناميكي بمعرّف الحملة لدى Meta لفصل إيرادات كل حملة.")}</p>}
      {outcomesReady && !loadError && unattributed.donationCount > 0 && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{dt("إيراد تواصل غير منسوب: {0} دولار من {1} تبرع مؤكد. الروابط القديمة لا تحدد حملة واحدة؛ هذا المبلغ غير مضاف إلى صفوف الحملات.", [unattributed.revenue.toLocaleString("en-US", { maximumFractionDigits: 2 }), unattributed.donationCount])}{unattributed.unpricedPaidCount > 0 && <> {dt("توجد {0} تبرعات دون تحويل مؤكد للدولار.", [unattributed.unpricedPaidCount])}</>}</p>}
      {outcomesReady && !loadError && analytics.unpriced > 0 && <p role="status" className="mb-4 text-sm text-amber-800">{dt("توجد {0} تبرعات دون تحويل مؤكد للدولار.", [analytics.unpriced])}</p>}
      {hasLoaded && !loadError && campaigns.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {[
            { label: dt("إجمالي المُرسل"), value: analytics.sent.toLocaleString("en-US"), hint: dt("رسالة مقبولة لدى المزوّد"), icon: Send },
            { label: dt("تفاعل/فتح"), value: `${analytics.engaged.toLocaleString("en-US")} · ${engagementRate}%`, hint: dt("قراءة/فتح/نقر/رد مثبت"), icon: Eye },
            { label: dt("ضغطات مسجلة"), value: `${analytics.clicked.toLocaleString("en-US")} · ${clickRate}%`, hint: dt("متاح عندما يرسل المزوّد حدث Click"), icon: MousePointerClick },
            { label: dt("تبرعات منسوبة"), value: outcomesReady ? analytics.donations.toLocaleString("en-US") : "—", hint: dt("UTM مطابق للحملة"), icon: HandHeart },
            { label: dt("إيراد منسوب"), value: outcomesReady ? `${analytics.revenue.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—", hint: dt("تبرعات مؤكدة الدفع من روابط الحملة"), icon: Banknote },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
                  <Icon className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">{item.value}</p>
                <p className="mt-1 text-[10px] text-slate-400">{item.hint}</p>
              </div>
            );
          })}
        </div>
      )}

      {loading && !hasLoaded ? (
        // Shaped like the table it replaces, so the layout does not jump when rows arrive.
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-10 border-b border-slate-100 bg-slate-50/90" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-3 py-3 last:border-0">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-slate-100" />
              <div className="hidden h-3.5 w-24 animate-pulse rounded bg-slate-100 sm:block" />
              <div className="hidden h-3.5 w-16 animate-pulse rounded bg-slate-100 md:block" />
            </div>
          ))}
        </div>
      ) : loadError && !hasLoaded ? null : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={campaigns.length === 0 ? dt("لا توجد حملات تسويقية بعد") : dt("لا توجد حملة مطابقة")}
          description={
            campaigns.length === 0
              ? dt("الحملة ترسل قالبًا واحدًا لمجموعة متبرعين تختارها  كلٌّ بلغته المفضّلة. ابدأ باختيار القناة.")
              : dt("جرّب توسيع التصفية أو مسحها.")
          }
          action={
            campaigns.length === 0 ? (
              <Button className="gap-1.5 bg-brand hover:bg-brand/90" asChild>
                <Link href="/dashboard/communication/campaigns/new">
                  <Plus className="h-4 w-4" />
                  {dt("إنشاء أول حملة")}</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setChannel("all");
                  setStatus("active");
                }}
              >
                {dt("مسح التصفية")}</Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {dtx("{0} حملة", [filtered.length])}{filtered.length !== campaigns.length && (
              <span className="font-normal normal-case tracking-normal text-slate-400"> {dtx(" من {0}", [campaigns.length])}</span>
            )}
          </p>
          <CampaignsTable campaigns={filtered} sort={sort} onSort={toggleSort} onChanged={load} />
        </>
      )}
    </div>
  );
}
