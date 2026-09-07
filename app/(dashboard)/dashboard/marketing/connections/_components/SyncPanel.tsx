"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  Loader2,
  RefreshCw,
  Activity,
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  istanbulTodayKey,
  istanbulAddCalendarDaysKey,
} from "@/lib/dashboard/istanbul-client-date";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  PLATFORM_ICON,
  type PlatformKey,
} from "./platform-meta";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الانتظار",
  RUNNING: "قيد التنفيذ",
  SUCCESS: "مكتمل",
  FAILED: "فشل",
  MISSING_CONFIG: "إعدادات ناقصة",
  NOT_IMPLEMENTED: "لم يتم التنفيذ بعد",
  PARTIAL_SUCCESS: "مكتمل جزئيًا",
};

const STATUS_PILL: Record<string, string> = {
  PENDING: "bg-slate-50 text-slate-600 border-slate-200",
  RUNNING: "bg-sky-50 text-sky-700 border-sky-200",
  SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  MISSING_CONFIG: "bg-amber-50 text-amber-700 border-amber-200",
  NOT_IMPLEMENTED: "bg-sky-50 text-sky-700 border-sky-200",
  PARTIAL_SUCCESS: "bg-amber-50 text-amber-700 border-amber-200",
};

const PLATFORM_SELECTORS = [
  { value: "all", label: "كل المنصات" },
  { value: "meta", label: "Meta" },
  { value: "google_ads", label: "Google Ads" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "ga4", label: "GA4" },
  { value: "twilio", label: "Twilio" },
] as const;

interface ConnectionLite {
  id: string;
  name: string;
  platform: string;
  enabled: boolean;
}

interface SyncRun {
  id: string;
  connectionId: string | null;
  connectionName: string | null;
  platform: string;
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsFetched: number;
  error: string | null;
  metadata: unknown;
}

interface SnapshotSummary {
  connectionId: string;
  connectionName: string;
  platform: string;
  accountId: string | null;
  lastSyncAt: string | null;
  snapshots: {
    campaigns: number;
    adGroups: number;
    ads: number;
    messaging: number;
    lastCampaignDate: string | null;
    lastMessagingDate: string | null;
  };
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function SyncPanel() {
  const [platform, setPlatform] = React.useState<string>("all");
  const [connectionId, setConnectionId] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState<string>(() =>
    istanbulAddCalendarDaysKey(istanbulTodayKey(), -7)
  );
  const [dateTo, setDateTo] = React.useState<string>(() => istanbulTodayKey());
  const [running, setRunning] = React.useState(false);
  const [connections, setConnections] = React.useState<ConnectionLite[]>([]);
  const [runs, setRuns] = React.useState<SyncRun[]>([]);
  const [snapshots, setSnapshots] = React.useState<SnapshotSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const fetchHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [a, b, c] = await Promise.all([
        axios.get<{ runs: SyncRun[] }>("/api/admin/marketing-platform-sync/status"),
        axios.get<{ summaries: SnapshotSummary[] }>(
          "/api/admin/marketing-platform-sync/snapshots"
        ),
        axios.get<{ connections: ConnectionLite[] }>(
          "/api/admin/marketing-platform-connections"
        ),
      ]);
      setRuns(a.data.runs ?? []);
      setSnapshots(b.data.summaries ?? []);
      setConnections(c.data.connections ?? []);
    } catch {
      toast.error("فشل في تحميل سجل المزامنة");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredConnections = React.useMemo(() => {
    if (platform === "all") return connections;
    const dbPlatform = platform.toUpperCase();
    return connections.filter((c) => c.platform === dbPlatform);
  }, [connections, platform]);

  const runSync = async () => {
    if (!dateFrom || !dateTo) {
      toast.error("اختر فترة المزامنة");
      return;
    }
    setRunning(true);
    try {
      const r = await axios.post<{
        ok: boolean;
        status: string;
        results: { status: string; platform: string; message: string }[];
      }>("/api/admin/marketing-platform-sync", {
        platform,
        connectionId: connectionId || undefined,
        dateFrom,
        dateTo,
      });
      const status = r.data.status;
      const msg =
        status === "success"
          ? "تمت المزامنة بنجاح."
          : status === "partial_success"
          ? "اكتملت المزامنة جزئيًا."
          : status === "missing_config"
          ? "بعض الاتصالات بها إعدادات ناقصة."
          : status === "not_implemented"
          ? "مزامنة هذه المنصة غير مفعّلة بعد."
          : "فشلت المزامنة.";
      if (status === "success" || status === "partial_success") toast.success(msg);
      else if (status === "missing_config") toast(msg, { icon: "⚙️" });
      else if (status === "not_implemented") toast(msg, { icon: "ℹ️" });
      else toast.error(msg);
      fetchHistory();
    } catch (e) {
      const message =
        axios.isAxiosError(e) && typeof e.response?.data?.error === "string"
          ? (e.response.data.error as string)
          : "فشلت المزامنة";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-slate-800">تشغيل مزامنة يدوية</h3>
        </div>
        <p className="text-[12px] text-slate-500 leading-relaxed">
          المزامنة الحالية تشمل مزامنة قاعدة بيانات الرسائل المحلية مع
          MarketingCampaignSnapshot. مزامنة Meta/Google Ads/TikTok/X/GA4 تنتظر
          عملاء API — حتى ذلك الحين تُعيد NOT_IMPLEMENTED بشكل آمن.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-slate-600 mb-1 block">المنصة</label>
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                setConnectionId("");
              }}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
            >
              {PLATFORM_SELECTORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-600 mb-1 block">حساب محدد</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
            >
              <option value="">كل الحسابات</option>
              {filteredConnections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-600 mb-1 block">من</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-600 mb-1 block">إلى</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full h-9 px-2 text-xs rounded-lg border border-slate-200 bg-slate-50"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchHistory}
            className="gap-2"
            disabled={loadingHistory}
          >
            <RefreshCw className={cn("w-4 h-4", loadingHistory && "animate-spin")} /> تحديث السجل
          </Button>
          <Button
            size="sm"
            onClick={runSync}
            disabled={running}
            className="gap-2 bg-brand hover:bg-brand/90"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            تشغيل المزامنة
          </Button>
        </div>
      </div>

      {/* Snapshot availability */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-slate-800">توفر اللقطات</h3>
        </div>
        {snapshots.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            لا توجد لقطات بعد — شغّل مزامنة لإنشاء أول السجلات.
          </div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/40 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحساب</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">حملات</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">مجموعات إعلانية</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">إعلانات</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">رسائل</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">آخر مزامنة</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const platformKey = s.platform as PlatformKey;
                  const Icon = PLATFORM_ICON[platformKey];
                  return (
                    <tr key={s.connectionId} className="border-b border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-900">{s.connectionName}</td>
                      <td className="py-2 px-3 text-slate-700">
                        <span className="inline-flex items-center gap-1.5">
                          {Icon ? <Icon className="w-3.5 h-3.5 text-slate-500" /> : null}
                          {PLATFORM_LABELS[platformKey] ?? s.platform}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{s.snapshots.campaigns}</td>
                      <td className="py-2 px-3 text-slate-700">{s.snapshots.adGroups}</td>
                      <td className="py-2 px-3 text-slate-700">{s.snapshots.ads}</td>
                      <td className="py-2 px-3 text-slate-700">{s.snapshots.messaging}</td>
                      <td className="py-2 px-3 text-slate-500">{fmtDateTime(s.lastSyncAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run history */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-slate-800">سجل المزامنات</h3>
          {loadingHistory ? <Loader2 className="w-3 h-3 animate-spin text-slate-400" /> : null}
        </div>
        {!loadingHistory && runs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            لا توجد محاولات سابقة — اضغط «تشغيل المزامنة» لبدء أول محاولة.
          </div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/40 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحساب</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحالة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الفترة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">عدد السجلات</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">بدأ</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">انتهى</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isOpen = expanded.has(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-700">
                          {PLATFORM_LABELS[r.platform as PlatformKey] ?? r.platform}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{r.connectionName ?? "—"}</td>
                        <td className="py-2 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium",
                              STATUS_PILL[r.status] ?? STATUS_PILL.NOT_IMPLEMENTED
                            )}
                          >
                            {STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                          {r.dateFrom.slice(0, 10)} → {r.dateTo.slice(0, 10)}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{r.rowsFetched}</td>
                        <td className="py-2 px-3 text-slate-500">{fmtDateTime(r.startedAt)}</td>
                        <td className="py-2 px-3 text-slate-500">{fmtDateTime(r.finishedAt)}</td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            className="inline-flex items-center gap-1 text-brand hover:underline text-[11px]"
                          >
                            {isOpen ? (
                              <>
                                إخفاء <ChevronUp className="w-3 h-3" />
                              </>
                            ) : (
                              <>
                                تفاصيل <ChevronDown className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-slate-50/40 border-b border-slate-100">
                          <td colSpan={8} className="py-2 px-3 text-[11px] text-slate-600 space-y-1">
                            {r.error ? (
                              <p className="text-rose-700 break-all">
                                <span className="text-slate-500">الخطأ:</span> {r.error}
                              </p>
                            ) : null}
                            <pre className="text-[10px] overflow-x-auto bg-slate-100 rounded p-2 whitespace-pre-wrap">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-sky-900 leading-relaxed">
          العمليات الفاشلة لا توقف بقية المزامنات. كل محاولة تُسجَّل في سجل
          التدقيق مع الحقول غير الحساسة — لا يتم تخزين أي tokens أو
          authentication secrets.
        </p>
      </div>
      <PlatformQuickRowList platforms={PLATFORMS} />
    </div>
  );
}

function PlatformQuickRowList({ platforms }: { platforms: readonly PlatformKey[] }) {
  return (
    <div className="hidden">
      {/* keeps tree-shake friendly references */}
      {platforms.map((p) => p)}
    </div>
  );
}
