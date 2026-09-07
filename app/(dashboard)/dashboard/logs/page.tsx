"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, ScrollText, Users, Heart, LayoutList,
  Search, X, ShieldCheck, UserCog, HandHeart, UserX,
  CalendarDays,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { displayActorName } from "@/lib/dashboard/audit-log-display";

type AuditRow = {
  id: string;
  createdAt: string;
  actorName: string | null;
  actorRole: string;
  action: string;
  messageAr: string;
  messageEn: string | null;
  stream?: string | null;
};

type TimePreset = "today" | "7d" | "30d" | "custom" | "all";
type StreamMode = "all" | "TEAM" | "DONOR";

function RoleIcon({ role }: { role: string }) {
  if (role === "ADMIN")
    return (
      <span title="مدير" className="shrink-0">
        <ShieldCheck className="w-3.5 h-3.5 text-brand" />
      </span>
    );
  if (role === "STAFF")
    return (
      <span title="طاقم" className="shrink-0">
        <UserCog className="w-3.5 h-3.5 text-brand-orange" />
      </span>
    );
  if (role === "DONOR")
    return (
      <span title="متبرع" className="shrink-0">
        <HandHeart className="w-3.5 h-3.5 text-rose-500" />
      </span>
    );
  return (
    <span title="زائر" className="shrink-0">
      <UserX className="w-3.5 h-3.5 text-slate-400" />
    </span>
  );
}

function streamBadge(row: AuditRow) {
  if (row.stream === "DONOR")
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 ms-1.5">متبرع</span>;
  if (row.stream === "TEAM")
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand ms-1.5">فريق</span>;
  return null;
}

function getDateRange(preset: TimePreset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === "7d") {
    const start = new Date(now); start.setDate(start.getDate() - 7);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === "30d") {
    const start = new Date(now); start.setDate(start.getDate() - 30);
    return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
  }
  if (preset === "custom" && customFrom) {
    return {
      dateFrom: new Date(customFrom).toISOString(),
      dateTo: customTo ? new Date(customTo + "T23:59:59").toISOString() : now.toISOString(),
    };
  }
  return {};
}

const STREAM_TABS = [
  { value: "all" as const, label: "الكل", icon: LayoutList },
  { value: "TEAM" as const, label: "الفريق", icon: Users },
  { value: "DONOR" as const, label: "المتبرعون", icon: Heart },
];

const TIME_PRESETS: { value: TimePreset; label: string }[] = [
  { value: "all", label: "آخر 100" },
  { value: "today", label: "اليوم" },
  { value: "7d", label: "7 أيام" },
  { value: "30d", label: "30 يوم" },
  { value: "custom", label: "مخصص" },
];

function LogTable({
  streamMode,
  userFilter,
  timePreset,
  customFrom,
  customTo,
}: {
  streamMode: StreamMode;
  userFilter: string;
  timePreset: TimePreset;
  customFrom: string;
  customTo: string;
}) {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const dateRange = useMemo(
    () => getDateRange(timePreset, customFrom, customTo),
    [timePreset, customFrom, customTo]
  );

  const fetchPage = useCallback(
    async (p: number, append: boolean) => {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await axios.get("/api/admin/audit-logs", {
          params: {
            ...(streamMode !== "all" ? { stream: streamMode } : {}),
            page: p,
            limit: timePreset === "all" ? 100 : 500,
            ...dateRange,
          },
        });
        const list = res.data?.logs ?? [];
        setLogs((prev) => (append ? [...prev, ...list] : list));
        setTotal(res.data?.pagination?.total ?? 0);
      } catch {
        toast.error("تعذر تحميل السجل");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [streamMode, timePreset, dateRange]
  );

  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next, true);
  };

  const filtered = useMemo(() => {
    if (!userFilter.trim()) return logs;
    const q = userFilter.trim().toLowerCase();
    // Match what the column shows, so searching "النظام" finds automated rows
    // instead of silently matching nothing.
    return logs.filter((r) => displayActorName(r).toLowerCase().includes(q));
  }, [logs, userFilter]);

  const hasMore = logs.length < total;
  const showStreamBadge = streamMode === "all";
  const colSpan = 3;

  return (
    <Card className="border-border shadow-sm" dir="rtl">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="py-3 px-4 font-semibold text-slate-600 whitespace-nowrap w-32">الوقت</th>
                <th className="py-3 px-4 font-semibold text-slate-600 whitespace-nowrap w-44">الاسم</th>
                <th className="py-3 px-4 font-semibold text-slate-600">الوصف</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colSpan} className="py-16 text-center">
                    <Loader2 className="w-7 h-7 animate-spin mx-auto text-slate-400" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="py-12 text-center text-slate-400 text-sm">
                    {userFilter ? "لا توجد نتائج لهذا المستخدم" : "لا توجد أحداث مسجّلة"}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-xs tabular-nums">
                      {new Date(row.createdAt).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <RoleIcon role={row.actorRole} />
                        <span className="text-slate-800 font-medium text-sm">
                          {displayActorName(row)}
                        </span>
                        {showStreamBadge && streamBadge(row)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 leading-snug">
                      {row.messageAr}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div className="p-3 border-t border-slate-100 text-center">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "تحميل المزيد"}
            </Button>
          </div>
        )}

        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {userFilter
              ? `${filtered.length} نتيجة من ${logs.length} محمّل`
              : `عرض ${logs.length} من ${total} إجمالي`}
          </p>
          {timePreset === "all" && total > 100 && (
            <p className="text-xs text-brand">
              يُعرض آخر 100 — اختر نطاقاً زمنياً لعرض المزيد
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardLogsPage() {
  const [stream, setStream] = useState<StreamMode>("all");
  const [userFilter, setUserFilter] = useState("");
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  return (
    <div className="min-h-0 space-y-5" dir="rtl">
      <PageHeader
        title="سجل النشاط"
        description="سجل ما نفّذه الفريق والمتبرعون. الأحداث التلقائية (الجدولة، التتبّع، الرسائل الآلية) لا تظهر هنا."
        icon={ScrollText}
      />

      {/* Compact filter bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center gap-2">

        {/* Stream filter */}
        <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5">
          {STREAM_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setStream(value)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                stream === value
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Time preset */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400 mx-2" />
          {TIME_PRESETS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimePreset(value)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                timePreset === value
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {timePreset === "custom" && (
          <>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 text-xs w-36 bg-white"
                placeholder="من"
              />
              <span className="text-slate-400 text-xs">—</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 text-xs w-36 bg-white"
                placeholder="إلى"
              />
            </div>
          </>
        )}

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* User search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute end-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <Input
            placeholder="بحث باسم المستخدم..."
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="pe-8 h-8 text-xs bg-white"
          />
          {userFilter && (
            <button
              onClick={() => setUserFilter("")}
              className="absolute start-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Icon legend */}
      {/* <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-brand" /> مدير</span>
        <span className="flex items-center gap-1"><UserCog className="w-3.5 h-3.5 text-brand-orange" /> طاقم</span>
        <span className="flex items-center gap-1"><HandHeart className="w-3.5 h-3.5 text-rose-500" /> متبرع</span>
      </div> */}

      {/* Table */}
      <LogTable
        streamMode={stream}
        userFilter={userFilter}
        timePreset={timePreset}
        customFrom={customFrom}
        customTo={customTo}
      />
    </div>
  );
}
