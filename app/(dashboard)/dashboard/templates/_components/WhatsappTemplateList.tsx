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
  Archive,
  ArchiveRestore,
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
  kind: string | null;
  purpose: string | null;
  status: string | null;
  approvalStatus: string | null;
  providerApprovalStatus?: string | null;
  internalApprovalStatus?: string | null;
  approvalLabelAr?: string | null;
  approvalReason?: string | null;
  statusUpdatedAt?: string | null;
  variants?: Array<{
    languageCode: string;
    locale: string | null;
    approvalStatus: string;
    category?: string | null;
    providerCategories?: string[];
    rejectionReason: string | null;
    qualityRating: string | null;
    lastSyncedAt: string;
  }>;
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
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  paused: "bg-orange-50 text-orange-700 border-orange-200",
  disabled: "bg-slate-100 text-slate-700 border-slate-300",
  in_appeal: "bg-sky-50 text-sky-700 border-sky-200",
  missing_in_waba: "bg-violet-50 text-violet-700 border-violet-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
};

const APPROVAL_LABEL: Record<string, string> = {
  approved: "معتمد",
  in_review: "قيد المراجعة",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  paused: "موقوف مؤقتًا",
  disabled: "معطّل",
  in_appeal: "قيد الاستئناف",
  missing_in_waba: "غير متاح في كل الحسابات",
  unknown: "غير معروف",
};

export function WhatsappTemplateList() {
  const [templates, setTemplates] = React.useState<WhatsappTemplateRow[]>([]);
  const [directSendEnabled, setDirectSendEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [section, setSection] = React.useState<"SYSTEM" | "CAMPAIGN">("CAMPAIGN");
  const [archiveView, setArchiveView] = React.useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [importing, setImporting] = React.useState(false);
  const [syncingMeta, setSyncingMeta] = React.useState(false);
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
      setDirectSendEnabled(res.data?.directSendEnabled === true);
    } catch {
      toast.error("فشل في تحميل القوالب");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const visibleTemplates = templates.filter((template) => {
    const category = String(template.category ?? template.purpose ?? "").toUpperCase();
    const isSystem =
      category === "UTILITY" ||
      category === "TRANSACTIONAL" ||
      category === "AUTHENTICATION" ||
      template.kind === "SYSTEM";
    const bucket = isSystem ? "SYSTEM" : "CAMPAIGN";
    const archived = String(template.status ?? "").toUpperCase() === "ARCHIVED";
    return bucket === section && (archiveView === "ARCHIVED" ? archived : !archived);
  });

  const archivedCount = templates.filter((template) => String(template.status ?? "").toUpperCase() === "ARCHIVED").length;

  const handleMetaSync = async () => {
    setSyncingMeta(true);
    try {
      const res = await axios.post("/api/dashboard/communication/whatsapp/templates/sync");
      const summary = res.data?.summary;
      toast.success(
        summary
          ? `تم تحديث حالات Meta: ${summary.matchedTemplates ?? 0} قالب، ${summary.variantsUpserted ?? 0} نسخة لغة/WABA.`
          : "تم تحديث حالات Meta.",
      );
      await fetchAll();
    } catch (error) {
      const data = (error as { response?: { data?: { error?: string; detail?: string } } }).response?.data;
      toast.error([data?.error, data?.detail].filter(Boolean).join(" — ") || "فشل تحديث حالات Meta");
    } finally {
      setSyncingMeta(false);
    }
  };

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

  const handleArchive = async (template: WhatsappTemplateRow, action: "ARCHIVE" | "RESTORE") => {
    const prompt = action === "ARCHIVE"
      ? `أرشفة «${template.name}»؟ سيختفي من اختيارات الإرسال الجديدة مع بقاء السجل والتاريخ محفوظين.`
      : `استعادة «${template.name}» من الأرشيف؟`;
    if (!window.confirm(prompt)) return;
    try {
      const res = await axios.post(`/api/templates/whatsapp/${template.id}/archive`, { action });
      if (!res.data?.ok) throw new Error(res.data?.error || "تعذّر تحديث القالب");
      toast.success(action === "ARCHIVE" ? "تمت أرشفة القالب" : "تمت استعادة القالب");
      await fetchAll();
    } catch (error) {
      const data = (error as { response?: { data?: { error?: string } } }).response?.data;
      toast.error(data?.error || (error as Error).message || "تعذّر تحديث القالب");
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button type="button" onClick={() => setSection("CAMPAIGN")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${section === "CAMPAIGN" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>الحملات التسويقية</button>
          <button type="button" onClick={() => setSection("SYSTEM")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${section === "SYSTEM" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>التلقائية والتوثيق</button>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setArchiveView("ACTIVE")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${archiveView === "ACTIVE" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500"}`}>النشطة</button>
          <button type="button" onClick={() => setArchiveView("ARCHIVED")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${archiveView === "ARCHIVED" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500"}`}>
            الأرشيف {archivedCount > 0 ? `(${archivedCount})` : ""}
          </button>
        </div>
      </div>
      {section === "SYSTEM" && (
        <div className={cn(
          "rounded-xl border px-3 py-2.5 text-xs leading-5",
          directSendEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600",
        )}>
          <span className="font-semibold">
            {directSendEnabled ? "Direct Send مفعّل للرسائل التلقائية." : "Direct Send Beta غير مفعّل بعد."}
          </span>{" "}
          {directSendEnabled
            ? "رسائل Utility/Auth التلقائية تحاول Direct Send أولًا، وتبقى قوالب Meta الحالية مسار fallback آمنًا إذا تعذر الإرسال المباشر."
            : "القوالب المعتمدة الحالية تظل مسار الإرسال الأساسي. عند تفعيل Direct Send لن نحذفها؛ ستبقى fallback للموثوقية."}
        </div>
      )}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {loading ? "…" : `${visibleTemplates.length} قالب واتساب`}
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
            onClick={handleMetaSync}
            disabled={syncingMeta}
            className="gap-2"
            title="جلب أحدث حالات اعتماد القوالب من Meta"
          >
            {syncingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
            تحديث من Meta
          </Button>
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
            ) : visibleTemplates.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  لا توجد قوالب بعد  اضغط «قالب جديد» للبدء
                </td>
              </tr>
            ) : (
              visibleTemplates.map((t) => {
                const mappedStatus = t.internalApprovalStatus ?? t.providerApprovalStatus ?? t.approvalStatus ?? "UNKNOWN";
                const approvalKey = mappedStatus.toLowerCase();
                const approvalClass = APPROVAL_PILL[approvalKey];
                const approvalLabel = t.approvalLabelAr ?? t.approvalStatus ?? "غير معروف";
                const requestedCategory = String(t.category ?? t.purpose ?? "").toUpperCase();
                const providerCategories = [...new Set((t.variants ?? []).flatMap((variant) =>
                  (variant.providerCategories?.length ? variant.providerCategories : variant.category ? [variant.category] : [])
                    .map((category) => String(category).toUpperCase())
                    .filter(Boolean),
                ))];
                const recategorized = (t.variants ?? []).filter((variant) => {
                  const categories = variant.providerCategories?.length ? variant.providerCategories : variant.category ? [variant.category] : [];
                  return requestedCategory && categories.some((category) => String(category).toUpperCase() !== requestedCategory);
                });
                return (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/60 align-top">
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
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          منصتنا: {String(t.category ?? t.purpose ?? t.templateType ?? "—").toUpperCase()}
                        </span>
                        {t.provider === "TWILIO" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 text-[10px]">
                            Twilio
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      {t.variants?.length ? (() => {
                        const variants = t.variants
                          .slice()
                          .sort((a, b) => (a.locale ?? a.languageCode).localeCompare(b.locale ?? b.languageCode));
                        const approvedCount = variants.filter((variant) => String(variant.approvalStatus).toUpperCase() === "APPROVED").length;
                        const reviewCount = variants.filter((variant) => ["PENDING", "IN_REVIEW"].includes(String(variant.approvalStatus).toUpperCase())).length;
                        const issueCount = Math.max(0, variants.length - approvedCount - reviewCount);
                        return (
                          <div className="min-w-[340px] max-w-[520px] space-y-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                {variants.length} لغة
                              </span>
                              {providerCategories.length === 1 && (
                                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                  Meta: {providerCategories[0]}
                                </span>
                              )}
                              {providerCategories.length > 1 && (
                                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                  Meta: تصنيفات متعددة
                                </span>
                              )}
                              {recategorized.length > 0 && (
                                <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700" title="Meta أعادت تصنيف لغة أو أكثر عن التصنيف المطلوب من المنصة">
                                  ⚠ أعادت Meta تصنيف {recategorized.length} لغة
                                </span>
                              )}
                              {approvedCount > 0 && (
                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                                  {approvedCount} معتمد
                                </span>
                              )}
                              {reviewCount > 0 && (
                                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                  {reviewCount} قيد المراجعة
                                </span>
                              )}
                              {issueCount > 0 && (
                                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                                  {issueCount} يحتاج انتباه
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {variants.map((variant) => {
                                const statusKey = String(variant.approvalStatus ?? "UNKNOWN").toLowerCase();
                                const language = variant.locale ?? variant.languageCode;
                                const variantCategories = variant.providerCategories?.length
                                  ? variant.providerCategories.map((category) => String(category).toUpperCase())
                                  : variant.category ? [String(variant.category).toUpperCase()] : [];
                                const categoryMismatch = requestedCategory && variantCategories.some((category) => category !== requestedCategory);
                                return (
                                  <span
                                    key={variant.languageCode}
                                    className={cn(
                                      "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium leading-none",
                                      APPROVAL_PILL[statusKey] ?? APPROVAL_PILL.unknown,
                                    )}
                                    title={[
                                      language,
                                      APPROVAL_LABEL[statusKey] ?? APPROVAL_LABEL.unknown,
                                      variantCategories.length ? `Meta: ${variantCategories.join(" / ")}` : null,
                                      categoryMismatch ? `المطلوب: ${requestedCategory}` : null,
                                      variant.rejectionReason,
                                    ].filter(Boolean).join(" — ")}
                                  >
                                    <span className="font-mono font-semibold">{language}</span>
                                    <span className="opacity-50">·</span>
                                    <span>{APPROVAL_LABEL[statusKey] ?? APPROVAL_LABEL.unknown}</span>
                                    {categoryMismatch && <span className="font-semibold text-orange-700">· {variantCategories.join("/")}</span>}
                                  </span>
                                );
                              })}
                            </div>
                            <div className="text-[9px] text-slate-400" title={t.approvalReason ?? undefined}>
                              الحالة الإجمالية: {approvalLabel}
                            </div>
                          </div>
                        );
                      })() : t.approvalStatus || t.providerApprovalStatus ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            approvalClass ?? APPROVAL_PILL.unknown,
                          )}
                          title={t.approvalReason ?? undefined}
                        >
                          {approvalLabel}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">محلي</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[300px]" title={t.body}>
                      <div className="line-clamp-2 leading-5">
                        {t.body}
                      </div>
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
                        {archiveView === "ACTIVE" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleArchive(t, "ARCHIVE")}
                            className="text-slate-700 hover:text-slate-900"
                          >
                            <Archive className="w-3.5 h-3.5 me-1" /> أرشف
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleArchive(t, "RESTORE")}
                            className="text-emerald-700 hover:text-emerald-800"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5 me-1" /> استعادة
                          </Button>
                        )}
                        {archiveView === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(t.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3.5 h-3.5 me-1" /> حذف
                          </Button>
                        )}
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
