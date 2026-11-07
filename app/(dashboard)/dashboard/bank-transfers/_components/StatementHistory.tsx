"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { Archive, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dt } from "@/lib/dashboard/i18n";
type Upload = {
  id: string;
  bankId: string;
  fileName: string;
  currency: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  excludedCount: number;
  possibleDuplicateCount: number;
  invalidCount: number;
  failedCount: number;
  unknownCount: number;
  status: string;
  archivedAt: string | null;
  createdAt: string | null;
  sheetName: string | null;
  dateRange: { from?: string; to?: string } | null;
  uploadedByName: string | null;
};
function status(value: string) {
  return value === "COMPLETED"
    ? dt("مكتمل")
    : value === "PARTIAL"
      ? dt("إدخال جزئي")
      : value === "PROCESSING"
        ? dt("قيد الإدخال")
        : value === "UNRESOLVED"
          ? dt("يحتاج تحققًا")
          : dt("سجل سابق");
}
export default function StatementHistory({
  refreshKey,
  bankName,
}: {
  refreshKey: number;
  bankName: (id: string) => string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [archiving, setArchiving] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    axios
      .get<{ uploads: Upload[] }>("/api/admin/bank-transfers/uploads", {
        signal: controller.signal,
      })
      .then((response) => setUploads(response.data.uploads ?? []))
      .catch((e) => {
        if (!axios.isCancel(e)) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshKey, reload]);
  async function archive(upload: Upload) {
    if (
      !window.confirm(
        dt(
          "أرشفة هذا الكشف من القائمة؟ ستبقى حركاته والتبرعات المرتبطة محفوظة.",
        ),
      )
    )
      return;
    setArchiving(upload.id);
    setError(false);
    try {
      await axios.delete("/api/admin/bank-transfers/uploads", {
        data: { ids: [upload.id] },
      });
      setReload((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setArchiving("");
    }
  }
  const visible = uploads.filter(
    (upload) => showArchived || !upload.archivedAt,
  );
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-semibold">{dt("سجل الكشوف")}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {dt("آخر 100 كشف مع النتائج الفعلية للإدخال.")}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            {dt("إظهار المؤرشف")}
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => setReload((n) => n + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={14} />
            {dt("تحديث")}
          </Button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="m-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
        >
          {dt("تعذّر تحميل السجل أو تأكيد الأرشفة. أعد التحديث.")}
        </p>
      )}
      {loading ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 p-12 text-slate-400"
        >
          <Loader2 size={18} className="animate-spin" />
          {dt("جاري التحميل…")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-start text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  dt("الكشف والحساب"),
                  dt("الفترة"),
                  dt("الحالة"),
                  dt("جديدة"),
                  dt("موجودة سابقًا"),
                  dt("تحتاج فحصًا"),
                  dt("التاريخ"),
                  dt("إجراءات"),
                ].map((h) => (
                  <th key={h} className="p-4 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((upload) => (
                <tr key={upload.id} className="border-t border-slate-100">
                  <td className="p-4">
                    <div className="flex gap-2">
                      <FileSpreadsheet
                        className="shrink-0 text-slate-400"
                        size={17}
                      />
                      <div>
                        <p className="font-medium text-slate-800">
                          {upload.fileName}
                        </p>
                        <p className="mt-1 text-slate-400">
                          {bankName(upload.bankId)} · {upload.currency}
                          {upload.sheetName ? ` · ${upload.sheetName}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 whitespace-nowrap" dir="ltr">
                    {upload.dateRange?.from ?? "—"}
                    <br />
                    {upload.dateRange?.to ?? "—"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-1 ${upload.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                    >
                      {status(upload.status)}
                    </span>
                    {upload.archivedAt && (
                      <p className="mt-2 text-slate-400">{dt("مؤرشف")}</p>
                    )}
                  </td>
                  <td className="p-4 font-semibold tabular-nums">
                    {upload.importedCount}
                  </td>
                  <td className="p-4 tabular-nums">{upload.duplicateCount}</td>
                  <td className="p-4 tabular-nums">
                    {upload.possibleDuplicateCount +
                      upload.invalidCount +
                      upload.failedCount +
                      upload.unknownCount}
                  </td>
                  <td className="p-4 whitespace-nowrap text-slate-500">
                    {upload.createdAt
                      ? new Date(upload.createdAt).toLocaleString(undefined, {
                          timeZone: "Europe/Istanbul",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                    <p className="mt-1 text-[10px]">
                      {upload.uploadedByName ?? ""}
                    </p>
                  </td>
                  <td className="p-4">
                    {!upload.archivedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={
                          Boolean(archiving) || upload.status === "PROCESSING"
                        }
                        onClick={() => archive(upload)}
                      >
                        <Archive size={14} />
                        {dt("أرشفة")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    {dt("لا توجد كشوف مسجلة في هذه القائمة.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
