"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import {
  Plug,
  Plus,
  Loader2,
  Pencil,
  Activity,
  RefreshCw,
  Power,
  PowerOff,
  CheckCircle2,
  AlertTriangle,
  Info,
  ListChecks,
  ShieldAlert,
  PauseCircle,
  Clock,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectionDrawer } from "./ConnectionDrawer";
import { SyncPanel } from "./SyncPanel";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PLATFORM_ACCENT,
  PLATFORM_CATEGORY,
  PLATFORM_ICON,
  PLATFORM_LABELS,
  PLATFORMS,
  STATUS_LABELS,
  STATUS_PILL,
  type CategoryKey,
  type PlatformKey,
} from "./platform-meta";
import { getCountryLabel, getLocaleLabel } from "@/lib/marketing/locales-countries";

interface ConnectionRow {
  id: string;
  category: string;
  platform: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  status: string;
  enabled: boolean;
  supportedLocales: string[];
  supportedCountries: string[];
  defaultCurrency: string | null;
  lastSyncAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  readiness: {
    completionPercent: number;
    missingRequiredFields: string[];
    missingOptionalFields: string[];
    nextStepMessage: string;
    status: string;
  };
}

interface ApiPayload {
  connections: ConnectionRow[];
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    errored: number;
    disabled: number;
    lastSyncAt: string | null;
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

const PIXEL_APPLICABLE_PLATFORMS = new Set(["META", "GA4", "GOOGLE_ADS", "TIKTOK", "X"]);

export function ConnectionsPageClient() {
  const [data, setData] = React.useState<ApiPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<CategoryKey | "ALL">("ALL");
  const [view, setView] = React.useState<"connections" | "sync">("connections");
  const [drawer, setDrawer] = React.useState<{
    open: boolean;
    editingId: string | null;
    initialPlatform?: PlatformKey;
  }>({ open: false, editingId: null });
  const [busyAction, setBusyAction] = React.useState<{ id: string; kind: string } | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get<ApiPayload>("/api/admin/marketing-platform-connections");
      setData(r.data);
    } catch (e) {
      setError(
        axios.isAxiosError(e) && typeof e.response?.data?.error === "string"
          ? (e.response.data.error as string)
          : "فشل في تحميل الاتصالات"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredConnections = React.useMemo(() => {
    if (!data) return [];
    if (category === "ALL") return data.connections;
    return data.connections.filter((c) => c.category === category);
  }, [data, category]);

  const platformStats = React.useMemo(() => {
    const map = new Map<
      PlatformKey,
      {
        platform: PlatformKey;
        total: number;
        complete: number;
        incomplete: number;
        lastSyncAt: string | null;
        lastError: string | null;
      }
    >();
    for (const p of PLATFORMS) {
      map.set(p, {
        platform: p,
        total: 0,
        complete: 0,
        incomplete: 0,
        lastSyncAt: null,
        lastError: null,
      });
    }
    for (const c of data?.connections ?? []) {
      const slot = map.get(c.platform as PlatformKey);
      if (!slot) continue;
      slot.total += 1;
      if (c.readiness.completionPercent >= 100 && c.enabled) slot.complete += 1;
      else if (c.readiness.missingRequiredFields.length > 0) slot.incomplete += 1;
      if (c.lastSyncAt && (!slot.lastSyncAt || c.lastSyncAt > slot.lastSyncAt)) {
        slot.lastSyncAt = c.lastSyncAt;
      }
      if (c.lastError) slot.lastError = c.lastError;
    }
    return map;
  }, [data]);

  const handleAction = async (id: string, kind: "enable" | "disable" | "test" | "sync") => {
    setBusyAction({ id, kind });
    try {
      const r = await axios.post<{ status: string; message: string }>(
        `/api/admin/marketing-platform-connections/${id}/${kind}`
      );
      const msg = r.data?.message ?? "تم";
      if (r.data?.status === "active" || r.data?.status === "disabled") toast.success(msg);
      else if (r.data?.status === "missing_config") toast(msg, { icon: "⚙️" });
      else if (r.data?.status === "not_implemented") toast(msg, { icon: "ℹ️" });
      else toast(msg);
      fetchAll();
    } catch (e) {
      const message =
        axios.isAxiosError(e) && typeof e.response?.data?.error === "string"
          ? (e.response.data.error as string)
          : "فشل التنفيذ";
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyToPixels = async (connection: ConnectionRow) => {
    if (!PIXEL_APPLICABLE_PLATFORMS.has(connection.platform)) {
      toast("هذه المنصة لا تُطبّق مباشرة على قسم البكسلات والتتبع", { icon: "ℹ️" });
      return;
    }
    if (connection.readiness.missingRequiredFields.length > 0) {
      toast("أكمل الحقول المطلوبة قبل تطبيق الاتصال على البكسلات", { icon: "⚙️" });
      return;
    }
    setBusyAction({ id: connection.id, kind: "apply-to-pixels" });
    try {
      const r = await axios.post<{ status: string; message: string; changedFields: string[] }>(
        `/api/admin/marketing-platform-connections/${connection.id}/apply-to-pixels`
      );
      toast.success(r.data.message ?? "تم تطبيق الاتصال على قسم البكسلات والتتبع");
    } catch (e) {
      const message =
        axios.isAxiosError(e) && typeof e.response?.data?.message === "string"
          ? (e.response.data.message as string)
          : axios.isAxiosError(e) && typeof e.response?.data?.error === "string"
          ? (e.response.data.error as string)
          : "فشل تطبيق الاتصال على قسم البكسلات";
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl p-2 bg-brand/10 text-brand">
            <Plug className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">ربط المنصات والحسابات</h1>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-2xl">
              إدارة حسابات الإعلانات والتحليلات والرسائل، ومراجعة اكتمال الإعدادات
              قبل المزامنة. يمكن تطبيق اتصال مكتمل على قسم «البكسلات والتتبع» عند الحاجة،
              بدون دمج القسمين أو كسر التتبع الحالي.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> تحديث
          </Button>
          <Button
            size="sm"
            onClick={() => setDrawer({ open: true, editingId: null })}
            className="gap-2 bg-brand hover:bg-brand/90"
          >
            <Plus className="w-4 h-4" /> إضافة اتصال
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-[12px] text-sky-900 leading-relaxed">
          قسم Connections يظل مصدرًا لإدارة حسابات المنصات والمزامنة. زر «تطبيق على البكسلات» ينسخ القيم المناسبة فقط إلى
          صفحة «إعدادات البكسلات والتتبع» مثل Pixel ID وGA4 API Secret وCAPI Token، ولا يغير سلوك التبرعات مباشرة إلا بعد حفظ القيم هناك.
        </p>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 -mb-px">
        <button
          type="button"
          onClick={() => setView("connections")}
          className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
            view === "connections"
              ? "border-brand text-brand"
              : "border-transparent text-slate-600 hover:text-slate-900"
          )}
        >
          الحسابات والاتصالات
        </button>
        <button
          type="button"
          onClick={() => setView("sync")}
          className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
            view === "sync"
              ? "border-brand text-brand"
              : "border-transparent text-slate-600 hover:text-slate-900"
          )}
        >
          المزامنة
        </button>
      </div>

      {view === "sync" ? (
        <SyncPanel />
      ) : (
        <ConnectionsView />
      )}
      <ConnectionDrawer
        open={drawer.open}
        onOpenChange={(open) =>
          setDrawer({
            open,
            editingId: open ? drawer.editingId : null,
            initialPlatform: drawer.initialPlatform,
          })
        }
        editingId={drawer.editingId}
        initialPlatform={drawer.initialPlatform}
        onSaved={fetchAll}
      />
    </div>
  );

  function ConnectionsView() {
    return (
      <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          title="إجمالي الاتصالات"
          value={data?.summary.total ?? 0}
          icon={ListChecks}
          tone="slate"
        />
        <SummaryCard
          title="اتصالات مكتملة"
          value={data?.summary.complete ?? 0}
          icon={CheckCircle2}
          tone="emerald"
        />
        <SummaryCard
          title="إعدادات ناقصة"
          value={data?.summary.incomplete ?? 0}
          icon={AlertTriangle}
          tone="amber"
        />
        <SummaryCard
          title="بها أخطاء"
          value={data?.summary.errored ?? 0}
          icon={ShieldAlert}
          tone="rose"
        />
        <SummaryCard
          title="غير مفعّلة"
          value={data?.summary.disabled ?? 0}
          icon={PauseCircle}
          tone="slate"
        />
        <SummaryCard
          title="آخر مزامنة"
          value={fmtDateTime(data?.summary.lastSyncAt ?? null)}
          icon={Clock}
          tone="sky"
          isText
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryPill
          label="الكل"
          active={category === "ALL"}
          onClick={() => setCategory("ALL")}
        />
        {CATEGORIES.map((c) => (
          <CategoryPill
            key={c}
            label={CATEGORY_LABELS[c]}
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PLATFORMS.filter(
          (p) => category === "ALL" || PLATFORM_CATEGORY[p] === category
        ).map((p) => {
          const stats = platformStats.get(p)!;
          const Icon = PLATFORM_ICON[p];
          return (
            <div
              key={p}
              className={cn(
                "rounded-xl border p-3 flex flex-col gap-2 bg-white shadow-sm",
                PLATFORM_ACCENT[p]
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <h3 className="text-sm font-semibold flex-1 truncate">{PLATFORM_LABELS[p]}</h3>
                <span className="text-[10px] opacity-70">
                  {CATEGORY_LABELS[PLATFORM_CATEGORY[p]]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Stat label="الاتصالات" value={stats.total} />
                <Stat label="مكتملة" value={stats.complete} />
                <Stat label="ناقصة" value={stats.incomplete} />
              </div>
              {stats.lastSyncAt ? (
                <div className="text-[10px] opacity-80">
                  آخر مزامنة: {fmtDateTime(stats.lastSyncAt)}
                </div>
              ) : null}
              {stats.lastError ? (
                <div className="text-[10px] text-rose-700 truncate" title={stats.lastError}>
                  {stats.lastError}
                </div>
              ) : null}
              <div className="flex gap-1.5 pt-1 mt-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[11px] gap-1 bg-white/70"
                  onClick={() =>
                    setDrawer({ open: true, editingId: null, initialPlatform: p })
                  }
                >
                  <Plus className="w-3 h-3" /> إضافة حساب
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-[11px] bg-white/70"
                  onClick={() => setCategory(PLATFORM_CATEGORY[p])}
                >
                  عرض الحسابات
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connections table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل الاتصالات…
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 m-3 text-sm text-rose-700">
            {error}
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            {category === "ALL"
              ? "لا توجد اتصالات بعد — اضغط «إضافة اتصال» لإضافة أول حساب."
              : "لا توجد حسابات لهذا التصنيف بعد."}
          </div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">المنصة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">التصنيف</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">اسم الاتصال</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">Account ID</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">اللغات</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الدول</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الاكتمال</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الحالة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">آخر اختبار</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">آخر مزامنة</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnections.map((c) => {
                  const platformKey = c.platform as PlatformKey;
                  const Icon = PLATFORM_ICON[platformKey] ?? Plug;
                  const canApplyToPixels = PIXEL_APPLICABLE_PLATFORMS.has(c.platform);
                  return (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-800">{PLATFORM_LABELS[platformKey] ?? c.platform}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {CATEGORY_LABELS[c.category as CategoryKey] ?? c.category}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2 px-3 font-mono text-[10px] text-slate-500">
                        {c.accountId ?? "—"}
                      </td>
                      <td className="py-2 px-3">
                        {c.supportedLocales.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.supportedLocales.map((l) => (
                              <span
                                key={l}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]"
                              >
                                {getLocaleLabel(l)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {c.supportedCountries.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {c.supportedCountries.slice(0, 3).map((cc) => (
                              <span
                                key={cc}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]"
                                title={getCountryLabel(cc)}
                              >
                                {cc}
                              </span>
                            ))}
                            {c.supportedCountries.length > 3 ? (
                              <span className="text-[10px] text-slate-500">
                                +{c.supportedCountries.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={cn(
                                "h-full",
                                c.readiness.completionPercent === 100
                                  ? "bg-emerald-500"
                                  : c.readiness.completionPercent >= 60
                                  ? "bg-amber-400"
                                  : "bg-rose-500"
                              )}
                              style={{ width: `${c.readiness.completionPercent}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-700">
                            {c.readiness.completionPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium",
                            STATUS_PILL[c.status] ?? STATUS_PILL.NOT_IMPLEMENTED
                          )}
                          title={c.readiness.nextStepMessage}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{fmtDateTime(c.lastTestAt)}</td>
                      <td className="py-2 px-3 text-slate-500">{fmtDateTime(c.lastSyncAt)}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          <ActionButton
                            label="تعديل"
                            icon={Pencil}
                            onClick={() =>
                              setDrawer({ open: true, editingId: c.id })
                            }
                          />
                          <ActionButton
                            label="اختبار"
                            icon={Activity}
                            busy={busyAction?.id === c.id && busyAction.kind === "test"}
                            onClick={() => handleAction(c.id, "test")}
                          />
                          {canApplyToPixels ? (
                            <ActionButton
                              label="تطبيق على البكسلات"
                              icon={Settings2}
                              tone="positive"
                              busy={busyAction?.id === c.id && busyAction.kind === "apply-to-pixels"}
                              onClick={() => handleApplyToPixels(c)}
                            />
                          ) : null}
                          <ActionButton
                            label="مزامنة"
                            icon={RefreshCw}
                            busy={busyAction?.id === c.id && busyAction.kind === "sync"}
                            onClick={() => handleAction(c.id, "sync")}
                          />
                          {c.enabled ? (
                            <ActionButton
                              label="إيقاف"
                              icon={PowerOff}
                              tone="warn"
                              busy={busyAction?.id === c.id && busyAction.kind === "disable"}
                              onClick={() => handleAction(c.id, "disable")}
                            />
                          ) : (
                            <ActionButton
                              label="تفعيل"
                              icon={Power}
                              tone="positive"
                              busy={busyAction?.id === c.id && busyAction.kind === "enable"}
                              onClick={() => handleAction(c.id, "enable")}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
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
          هذه الصفحة لا تستبدل إعدادات التتبع تلقائيًا. استخدم زر «تطبيق على البكسلات» فقط للاتصالات المكتملة التي تريد نسخها إلى قسم «البكسلات والتتبع».
        </p>
      </div>
      </>
    );
  }
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
  isText,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "slate" | "emerald" | "amber" | "rose" | "sky";
  isText?: boolean;
}) {
  const toneClass: Record<typeof tone, string> = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <div className={cn("rounded-xl border p-3 shadow-sm", toneClass[tone])}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11px]">{title}</p>
        <Icon className="w-4 h-4" />
      </div>
      <p className={cn("font-bold", isText ? "text-sm" : "text-2xl")} dir={isText ? "rtl" : "ltr"}>
        {value}
      </p>
    </div>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-lg border text-xs transition-colors",
        active
          ? "bg-brand text-white border-brand"
          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
      )}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/70 px-1.5 py-1 text-center">
      <p className="opacity-70">{label}</p>
      <p className="font-bold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  busy,
  tone,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  busy?: boolean;
  tone?: "positive" | "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] hover:bg-slate-50 disabled:opacity-60",
        tone === "positive"
          ? "border-emerald-200 text-emerald-700"
          : tone === "warn"
          ? "border-amber-200 text-amber-700"
          : "border-slate-200 text-slate-700"
      )}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
