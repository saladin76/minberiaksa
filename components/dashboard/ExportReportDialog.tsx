"use client";

/**
 * Reusable export setup dialog for dashboard pages.
 *
 * Renders one popup with every filter that exists on the current page plus a
 * format toggle (Excel / CSV). The dashboard pre-fills the dialog with whatever
 * filters the user already selected on the page so the export "just works"
 * from one click, but the user can still override any field before exporting.
 *
 * Designed for finance ops — they need the per-campaign breakdown to be
 * sortable in Excel and they need to keep team support separated from cause
 * funds. Both of those concerns are handled by the API + lib/donation-export.ts;
 * this dialog just collects the inputs.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ExportFormat = "xlsx" | "csv";

export interface ExportFilterOption {
  /** Form value to send (e.g. "all", a UUID, "PAID"). */
  value: string;
  /** Human label shown in the dropdown. */
  label: string;
}

export interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Endpoint that takes filters via query string and returns the file. */
  endpoint: string;
  /** Dialog header — usually the page name (e.g. "تصدير تبرعات الإحالة"). */
  title: string;
  /** Optional explanatory text. */
  description?: string;
  /** Initial values copied from the page filters when the dialog opens. */
  defaults: ExportFormState;
  /** Lookup data for the dropdowns. */
  options: {
    categories?: ExportFilterOption[];
    campaigns?: ExportFilterOption[];
    countries?: ExportFilterOption[];
    locales?: ExportFilterOption[];
  };
  /** Which filter fields to render. Page-specific. */
  enabledFields: {
    period?: boolean;
    dateRange?: boolean;
    category?: boolean;
    campaign?: boolean;
    status?: boolean;
    type?: boolean;          // ONE_TIME / MONTHLY / all
    subStatus?: boolean;     // ACTIVE / PAUSED / CANCELLED (monthly page)
    locale?: boolean;
    country?: boolean;
    subscriptionOnly?: boolean;
    sort?: boolean;
    limit?: boolean;
  };
}

export interface ExportFormState {
  format: ExportFormat;
  period: "day" | "week" | "month" | "all" | "custom";
  start: string;             // YYYY-MM-DD
  end: string;
  categoryId: string;
  campaignId: string;
  status: "all" | "PAID" | "FAILED";
  type: "all" | "ONE_TIME" | "MONTHLY";
  subStatus: "all" | "ACTIVE" | "PAUSED" | "CANCELLED";
  locale: string;
  country: string;
  subscriptionOnly: boolean;
  sortBy: "date" | "amount";
  sortOrder: "asc" | "desc";
  limit: number;
}

export const EXPORT_DEFAULTS: ExportFormState = {
  format: "xlsx",
  period: "all",
  start: "",
  end: "",
  categoryId: "all",
  campaignId: "all",
  status: "all",
  type: "all",
  subStatus: "all",
  locale: "all",
  country: "all",
  subscriptionOnly: false,
  sortBy: "date",
  sortOrder: "desc",
  limit: 20000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveDateRange(state: ExportFormState): { start: string; end: string } {
  if (state.period === "all") return { start: "", end: "" };
  if (state.period === "custom") return { start: state.start, end: state.end };
  const end = new Date();
  const start = new Date(end);
  const days = state.period === "day" ? 1 : state.period === "week" ? 7 : 30;
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function buildQuery(endpoint: string, state: ExportFormState, fields: ExportReportDialogProps["enabledFields"]): string {
  const params = new URLSearchParams();
  params.set("format", state.format);

  if (fields.period || fields.dateRange) {
    const { start, end } = resolveDateRange(state);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  if (fields.category && state.categoryId !== "all") params.set("categoryId", state.categoryId);
  if (fields.campaign && state.campaignId !== "all") params.set("campaignId", state.campaignId);
  if (fields.status && state.status !== "all") params.set("status", state.status);
  if (fields.type && state.type !== "all") {
    params.set("donationType", state.type);
  }
  if (fields.subStatus && state.subStatus !== "all") params.set("subStatus", state.subStatus);
  if (fields.locale && state.locale !== "all") params.set("locale", state.locale);
  if (fields.country && state.country !== "all") params.set("country", state.country);
  if (fields.subscriptionOnly && state.subscriptionOnly) params.set("subscriptionOnly", "true");
  if (fields.sort) {
    params.set("sortBy", state.sortBy);
    params.set("sortOrder", state.sortOrder);
  }
  if (fields.limit) params.set("limit", String(state.limit));

  return `${endpoint}?${params.toString()}`;
}

async function triggerDownload(url: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = "تعذّر تصدير التقرير";
    try {
      const json = await res.json();
      if (json?.error) msg = json.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const dispo = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^"]+)"?/i.exec(dispo);
  const filename = match?.[1] ?? "export.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportReportDialog(props: ExportReportDialogProps) {
  const { open, onOpenChange, endpoint, title, description, defaults, options, enabledFields } = props;
  const [state, setState] = useState<ExportFormState>(defaults);
  const [downloading, setDownloading] = useState(false);

  // Sync defaults whenever the dialog re-opens (so it reflects current page filters)
  useEffect(() => {
    if (open) setState(defaults);
  }, [open, defaults]);

  const previewQs = useMemo(
    () => buildQuery(endpoint, state, enabledFields),
    [endpoint, state, enabledFields]
  );

  const handleExport = async () => {
    setDownloading(true);
    try {
      await triggerDownload(previewQs);
      toast.success("تم التصدير بنجاح");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تصدير التقرير");
    } finally {
      setDownloading(false);
    }
  };

  const setField = <K extends keyof ExportFormState>(k: K, v: ExportFormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 justify-end">
            <Download className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-right text-slate-600">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Format toggle */}
        <div className="grid grid-cols-2 gap-3 my-2">
          <button
            type="button"
            onClick={() => setField("format", "xlsx")}
            className={
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all " +
              (state.format === "xlsx"
                ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                : "border-slate-200 bg-white hover:border-slate-300")
            }
          >
            <FileSpreadsheet className={"w-7 h-7 " + (state.format === "xlsx" ? "text-emerald-600" : "text-slate-400")} />
            <div className="text-sm font-semibold">Excel (XLSX)</div>
            <div className="text-xs text-slate-500 text-center leading-tight">
              منسّق، ملخص + تفاصيل
            </div>
          </button>
          <button
            type="button"
            onClick={() => setField("format", "csv")}
            className={
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all " +
              (state.format === "csv"
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                : "border-slate-200 bg-white hover:border-slate-300")
            }
          >
            <FileText className={"w-7 h-7 " + (state.format === "csv" ? "text-blue-600" : "text-slate-400")} />
            <div className="text-sm font-semibold">CSV</div>
            <div className="text-xs text-slate-500 text-center leading-tight">
              نصي، لأنظمة المحاسبة
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Period */}
          {enabledFields.period && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">الفترة</Label>
              <Select
                value={state.period}
                onValueChange={(v) => setField("period", v as ExportFormState["period"])}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الوقت</SelectItem>
                  <SelectItem value="day">آخر يوم</SelectItem>
                  <SelectItem value="week">آخر أسبوع</SelectItem>
                  <SelectItem value="month">آخر شهر</SelectItem>
                  <SelectItem value="custom">مخصص</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom date range */}
          {enabledFields.dateRange && state.period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">من تاريخ</Label>
                <Input
                  type="date"
                  value={state.start}
                  onChange={(e) => setField("start", e.target.value)}
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">إلى تاريخ</Label>
                <Input
                  type="date"
                  value={state.end}
                  onChange={(e) => setField("end", e.target.value)}
                  className="text-right"
                />
              </div>
            </>
          )}

          {/* Category */}
          {enabledFields.category && options.categories && options.categories.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">القسم</Label>
              <Select
                value={state.categoryId}
                onValueChange={(v) => setField("categoryId", v)}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {options.categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Campaign */}
          {enabledFields.campaign && options.campaigns && options.campaigns.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">الحملة</Label>
              <Select
                value={state.campaignId}
                onValueChange={(v) => setField("campaignId", v)}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {options.campaigns.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Donation status */}
          {enabledFields.status && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">حالة التبرع</Label>
              <Select
                value={state.status}
                onValueChange={(v) => setField("status", v as ExportFormState["status"])}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="PAID">ناجح</SelectItem>
                  <SelectItem value="FAILED">فاشل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Donation type */}
          {enabledFields.type && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">نوع التبرع</Label>
              <Select
                value={state.type}
                onValueChange={(v) => setField("type", v as ExportFormState["type"])}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="ONE_TIME">لمرة واحدة</SelectItem>
                  <SelectItem value="MONTHLY">شهري</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subscription status */}
          {enabledFields.subStatus && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">حالة الاشتراك</Label>
              <Select
                value={state.subStatus}
                onValueChange={(v) => setField("subStatus", v as ExportFormState["subStatus"])}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="ACTIVE">نشط</SelectItem>
                  <SelectItem value="PAUSED">متوقف</SelectItem>
                  <SelectItem value="CANCELLED">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Locale */}
          {enabledFields.locale && options.locales && options.locales.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">اللغة</Label>
              <Select
                value={state.locale}
                onValueChange={(v) => setField("locale", v)}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="__unset">غير محدد</SelectItem>
                  {options.locales.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Country */}
          {enabledFields.country && options.countries && options.countries.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">الدولة</Label>
              <Select
                value={state.country}
                onValueChange={(v) => setField("country", v)}
              >
                <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="__unset">غير محدد</SelectItem>
                  {options.countries.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sort */}
          {enabledFields.sort && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">الترتيب حسب</Label>
                <Select
                  value={state.sortBy}
                  onValueChange={(v) => setField("sortBy", v as ExportFormState["sortBy"])}
                >
                  <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">التاريخ</SelectItem>
                    <SelectItem value="amount">القيمة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">الاتجاه</Label>
                <Select
                  value={state.sortOrder}
                  onValueChange={(v) => setField("sortOrder", v as ExportFormState["sortOrder"])}
                >
                  <SelectTrigger className="text-right"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">تنازلي</SelectItem>
                    <SelectItem value="asc">تصاعدي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Row limit */}
          {enabledFields.limit && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600">
                الحد الأقصى لعدد العمليات (1 - 50000)
              </Label>
              <Input
                type="number"
                min={1}
                max={50000}
                value={state.limit}
                onChange={(e) => setField("limit", Math.max(1, Math.min(50000, parseInt(e.target.value, 10) || 20000)))}
                className="text-right"
              />
            </div>
          )}
        </div>

        {/* subscriptionOnly switch */}
        {enabledFields.subscriptionOnly && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mt-2">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-700">الاشتراكات الشهرية فقط</div>
              <div className="text-xs text-slate-500">عرض التبرعات المرتبطة بدفعات شهرية</div>
            </div>
            <Switch
              checked={state.subscriptionOnly}
              onCheckedChange={(v) => setField("subscriptionOnly", !!v)}
            />
          </div>
        )}

        {/* Summary banner */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 leading-relaxed mt-2">
          <div className="font-semibold mb-1">يحتوي التقرير على:</div>
          <ul className="space-y-0.5 list-disc list-inside marker:text-emerald-600">
            <li>قائمة كاملة بكل عمليات التبرع المطابقة</li>
            <li>فصل واضح بين <strong>مبلغ التبرع</strong> و<strong>دعم الفريق</strong> و<strong>رسوم المعالجة</strong></li>
            <li>إجماليات لكل عملة بالقيمة المحلية + بالدولار</li>
            <li>تفصيل حسب الحملة (من الأعلى إلى الأدنى) ، القسم، الدولة، الإحالة، اللغة</li>
            <li>KPI شاملة: عدد العمليات، الناجحة، الفاشلة، متبرعون فريدون</li>
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloading}>
            إلغاء
          </Button>
          <Button onClick={handleExport} disabled={downloading} className="bg-blue-600 hover:bg-blue-700">
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 ms-2 animate-spin" />
                جاري التصدير...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 ms-2" />
                تصدير {state.format === "xlsx" ? "Excel" : "CSV"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
