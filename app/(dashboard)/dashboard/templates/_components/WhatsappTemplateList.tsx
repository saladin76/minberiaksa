"use client";

import * as React from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  DownloadCloud,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsappTemplateEditorDialog } from "./WhatsappTemplateEditorDialog";
import { WhatsappTemplatePreviewDialog } from "./WhatsappTemplatePreviewDialog";
import type {
  PreviewButton,
  PreviewHeader,
  PreviewVariable,
} from "./WhatsappTemplatePreview";

interface WhatsappTemplateRow {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
  channel: string | null;
  externalTemplateId: string | null;
  templateType: string | null;
  language: string | null;
  category: string | null;
  approvalStatus: string | null;
  header: PreviewHeader | null;
  footerText: string | null;
  buttons: PreviewButton[] | null;
  variables: PreviewVariable[] | null;
  lastImportedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface ImportSummary {
  status: "ok" | "missing_config" | "not_implemented" | "failed";
  messageAr: string;
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  error?: string | null;
}

const APPROVAL_PILL: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
};

export function WhatsappTemplateList() {
  const [templates, setTemplates] = React.useState<WhatsappTemplateRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [importStatus, setImportStatus] = React.useState<ImportSummary | null>(null);
  const [editor, setEditor] = React.useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [preview, setPreview] = React.useState<{ open: boolean; template: WhatsappTemplateRow | null }>({
    open: false,
    template: null,
  });

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/templates/whatsapp");
      setTemplates(res.data?.templates ?? []);
    } catch {
      toast.error("فشل في تحميل القوالب");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await axios.post<ImportSummary>("/api/templates/whatsapp/import");
      setImportStatus(res.data);
      if (res.data.status === "ok") {
        toast.success(res.data.messageAr);
        fetchAll();
      } else if (res.data.status === "missing_config") {
        toast(res.data.messageAr, { icon: "⚙️" });
      } else if (res.data.status === "not_implemented") {
        toast(res.data.messageAr, { icon: "ℹ️" });
      } else {
        toast.error(res.data.messageAr);
      }
    } catch {
      toast.error("فشل استيراد قوالب Twilio");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا القالب؟")) return;
    try {
      await axios.delete(`/api/templates/whatsapp/${id}`);
      toast.success("تم الحذف");
      fetchAll();
    } catch {
      toast.error("فشل الحذف");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {loading ? "…" : `${templates.length} قالب واتساب`}
          </p>
          {templates.some((t) => t.provider === "TWILIO") ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-600">
              {templates.filter((t) => t.provider === "TWILIO").length} من Twilio
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAll}
            disabled={loading}
            className="gap-2"
            title="إعادة التحميل من قاعدة البيانات"
          >
            <RefreshCw className="w-4 h-4" /> تحديث
          </Button>
          <Button
            size="sm"
            onClick={() => setEditor({ open: true, id: null })}
            className="gap-2 bg-[#25D366] hover:bg-[#25D366]/90"
          >
            <Plus className="w-4 h-4" /> قالب جديد
          </Button>
        </div>
      </div>

      {importStatus && importStatus.status !== "ok" ? (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm flex items-start gap-2",
            importStatus.status === "missing_config"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : importStatus.status === "not_implemented"
              ? "border-sky-200 bg-sky-50 text-sky-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{importStatus.messageAr}</p>
            {importStatus.error ? (
              <p className="text-[11px] mt-1 opacity-80 font-mono break-all">
                {importStatus.error}
              </p>
            ) : null}
            {importStatus.status === "missing_config" ? (
              <p className="text-[11px] mt-1 opacity-80">
                أضف TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN في إعدادات البيئة ثم
                أعِد المحاولة. لن يتم تخزين هذه القيم في سجل التدقيق.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="text-right py-3 px-4 font-semibold text-slate-700">الاسم</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">النوع</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">الحالة</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">المحتوى</th>
              <th className="text-right py-3 px-4 font-semibold text-slate-700">آخر تحديث</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  لا توجد قوالب بعد — اضغط «قالب جديد» للبدء
                </td>
              </tr>
            ) : (
              templates.map((t) => {
                const approvalKey = (t.approvalStatus ?? "").toLowerCase();
                const approvalClass = APPROVAL_PILL[approvalKey];
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-medium text-slate-900">{t.name}</span>
                        {t.externalTemplateId ? (
                          <span className="font-mono text-[10px] text-slate-500">
                            {t.externalTemplateId}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {t.templateType ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 text-[10px]">
                            {t.templateType}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                        {t.provider === "TWILIO" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 text-[10px]">
                            Twilio
                          </span>
                        ) : null}
                        {t.language ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[10px]">
                            {t.language}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {t.approvalStatus ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium",
                            approvalClass ?? APPROVAL_PILL.unknown
                          )}
                        >
                          {t.approvalStatus}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">محلي</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 truncate max-w-[320px]" title={t.body}>
                      {t.body}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(t.updatedAt).toLocaleDateString("ar-EG", { dateStyle: "medium" })}
                    </td>
                    <td className="py-3 px-4 text-left">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreview({ open: true, template: t })}
                          title="عرض القالب"
                        >
                          <Eye className="w-3.5 h-3.5 me-1" /> عرض
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor({ open: true, id: t.id })}
                        >
                          <Pencil className="w-3.5 h-3.5 me-1" /> تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(t.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3.5 h-3.5 me-1" /> حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editor.open && (
        <WhatsappTemplateEditorDialog
          id={editor.id}
          open={editor.open}
          onOpenChange={(open) => {
            setEditor((prev) => ({ ...prev, open }));
            if (!open) fetchAll();
          }}
        />
      )}

      <WhatsappTemplatePreviewDialog
        template={
          preview.template
            ? {
                id: preview.template.id,
                name: preview.template.name,
                body: preview.template.body,
                header: preview.template.header,
                footerText: preview.template.footerText,
                buttons: preview.template.buttons ?? [],
                variables: preview.template.variables ?? [],
                language: preview.template.language,
                category: preview.template.category,
                approvalStatus: preview.template.approvalStatus,
                templateType: preview.template.templateType,
                externalTemplateId: preview.template.externalTemplateId,
                lastImportedAt: preview.template.lastImportedAt,
              }
            : null
        }
        open={preview.open}
        onOpenChange={(open) => setPreview((prev) => ({ ...prev, open }))}
      />
    </div>
  );
}
