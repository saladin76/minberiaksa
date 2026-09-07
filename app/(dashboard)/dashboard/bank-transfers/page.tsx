"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Building2, CheckCircle2, Download, FileText, Landmark, Loader2, Plus, RefreshCw, Search, Trash2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { MetricSummaryBand } from "@/components/dashboard/MetricSummaryBand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Currency = "USD" | "TRY" | "EUR" | string;
type DonorLocale = "ar" | "tr" | "en" | "fr" | "de" | "es" | "pt" | "id" | string;
type TransactionStatus = "PENDING_REVIEW" | "APPROVED" | "IMPORTED" | "IGNORED" | "DELETED" | string;
type BankStats = { operationCount: number; totals: Record<string, number>; localeTotals: Record<string, Record<string, number>> };
type Bank = { id: string | null; code: string | null; nameAr: string; nameEn: string | null; nameTr: string | null; accountName: string | null; ibanLast4: string | null; currency: Currency; isActive: boolean; displayOrder: number; stats?: BankStats };
type PreviewRow = { rowNumber: number; transactionDate: string | null; description: string; donorName: string | null; amount: number | null; currency: Currency; donorLocale?: DonorLocale; direction: "CREDIT" | "DEBIT" | "UNKNOWN"; reference: string | null; suggestedProject: string; confidence: "LOW" | "MEDIUM" | "HIGH"; transactionHash?: string; raw: string[] };
type AmountColumnInfo = { source: "header:tutar" | "header:credit" | "header:amount" | "detected" | "none"; header: string | null };
type PreviewResponse = { fileName: string; bankId: string | null; currency: Currency; donorLocale: DonorLocale; parser: "spreadsheet" | "pdf"; fileHash: string; bankIban: string | null; rowCount: number; rows: PreviewRow[]; amountColumn?: AmountColumnInfo; warning: string | null };

/** Where the importer read the money from — shown so a wrong column is caught before committing. */
function amountColumnLabel(info: AmountColumnInfo | undefined) {
  if (!info || info.source === "none") return { text: "لم يُحدَّد عمود المبلغ", tone: "bad" as const };
  if (info.source === "detected") return { text: "عمود المبلغ: مُستنتَج من البيانات", tone: "warn" as const };
  return { text: `عمود المبلغ: ${info.header ?? "—"}`, tone: "good" as const };
}
type ImportedTransaction = { id: string | null; bankId: string | null; bankIban: string | null; transactionDate: string | null; donorName: string | null; description: string; amount: number | null; currency: string; donorLocale: string; transferMethod: string; suggestedProject: string; finalProject?: string | null; confidence: string; reference: string | null; status: TransactionStatus; reviewedByName?: string | null; approvedAt?: string | null; ignoredAt?: string | null; createdAt: string | null };
type FormState = { nameAr: string; nameEn: string; nameTr: string; accountName: string; ibanLast4: string; currency: Currency };
type EditState = { donorName: string; donorLocale: DonorLocale; finalProject: string };
type Filters = { q: string; status: string; bankId: string; currency: string; donorLocale: string; dateFrom: string; dateTo: string; amountMin: string; amountMax: string; sortBy: string; sortDir: string; limit: string };

const emptyForm: FormState = { nameAr: "", nameEn: "", nameTr: "", accountName: "", ibanLast4: "", currency: "USD" };
const defaultFilters: Filters = { q: "", status: "all", bankId: "all", currency: "all", donorLocale: "all", dateFrom: "", dateTo: "", amountMin: "", amountMax: "", sortBy: "createdAt", sortDir: "desc", limit: "50" };
const currencyLabels: Record<string, string> = { USD: "دولار USD", TRY: "ليرة تركية TRY", EUR: "يورو EUR" };
const localeLabels: Record<string, string> = { ar: "عربي", tr: "تركي", en: "إنجليزي", fr: "فرنسي", de: "ألماني", es: "إسباني", pt: "برتغالي", id: "إندونيسي" };

function money(n?: number | null, c?: string) { return `${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c ?? ""}`; }
function statusLabel(status: TransactionStatus) { if (status === "APPROVED" || status === "IMPORTED") return "معتمد"; if (status === "IGNORED") return "مستبعد"; if (status === "DELETED") return "محذوف"; return "تحتاج مراجعة"; }
function statusClass(status: TransactionStatus) { if (status === "APPROVED" || status === "IMPORTED") return "border-emerald-200 bg-emerald-50 text-emerald-700"; if (status === "IGNORED" || status === "DELETED") return "border-slate-200 bg-slate-50 text-slate-600"; return "border-amber-200 bg-amber-50 text-amber-700"; }
function previewRowKey(row: PreviewRow) { return row.transactionHash ?? `${row.rowNumber}-${row.description}`; }

export default function BankTransfersPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [supportedCurrencies, setSupportedCurrencies] = useState<Currency[]>(["USD", "TRY", "EUR"]);
  const [transactions, setTransactions] = useState<ImportedTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [statementCurrency, setStatementCurrency] = useState<Currency>("USD");
  const [donorLocale, setDonorLocale] = useState<DonorLocale>("ar");
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [excludedPreviewHashes, setExcludedPreviewHashes] = useState<Set<string>>(() => new Set());
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  const activeBanks = useMemo(() => banks.filter((b) => b.isActive), [banks]);
  const selectedBank = activeBanks.find((b) => b.id === selectedBankId || b.code === selectedBankId) ?? activeBanks[0];
  const pendingCount = transactions.filter((tx) => tx.status === "PENDING_REVIEW").length;
  const approvedCount = transactions.filter((tx) => tx.status === "APPROVED" || tx.status === "IMPORTED").length;
  const ignoredCount = transactions.filter((tx) => tx.status === "IGNORED").length;
  const visibleIds = transactions.map((tx) => tx.id).filter((id): id is string => Boolean(id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const visiblePreviewRows = useMemo(() => preview?.rows.filter((row) => !row.transactionHash || !excludedPreviewHashes.has(row.transactionHash)) ?? [], [preview, excludedPreviewHashes]);
  const currentQuery = useMemo(() => buildQuery(filters, page), [filters, page]);

  useEffect(() => { void loadInitial(); }, []);
  useEffect(() => { if (!selectedBankId && activeBanks[0]?.id) { setSelectedBankId(activeBanks[0].id); setStatementCurrency(activeBanks[0].currency); } }, [activeBanks, selectedBankId]);
  useEffect(() => { setSelectedIds((prev) => new Set([...prev].filter((id) => visibleIds.includes(id)))); }, [transactions.length]);

  function buildQuery(values: Filters, targetPage = page) {
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("limit", values.limit || "50");
    params.set("sortBy", values.sortBy || "createdAt");
    params.set("sortDir", values.sortDir || "desc");
    Object.entries(values).forEach(([key, value]) => { if (value && value !== "all" && !["limit", "sortBy", "sortDir"].includes(key)) params.set(key, value); });
    return params.toString();
  }

  function initEdits(rows: ImportedTransaction[]) { const next: Record<string, EditState> = {}; rows.forEach((tx) => { if (!tx.id) return; next[tx.id] = { donorName: tx.donorName ?? "", donorLocale: tx.donorLocale || "ar", finalProject: tx.finalProject || tx.suggestedProject || "تبرع عام" }; }); setEdits(next); }
  async function loadInitial() { setLoading(true); try { const banksRes = await axios.get<{ banks: Bank[]; supportedCurrencies: Currency[] }>("/api/admin/bank-transfers/banks"); setBanks(banksRes.data.banks ?? []); setSupportedCurrencies(banksRes.data.supportedCurrencies ?? ["USD", "TRY", "EUR"]); await loadTransactions(defaultFilters, 1); } catch { toast.error("فشل تحميل بيانات التحويلات البنكية"); } finally { setLoading(false); } }
  async function loadTransactions(nextFilters = filters, nextPage = page) { setTransactionsLoading(true); try { const query = buildQuery(nextFilters, nextPage); const txRes = await axios.get<{ transactions: ImportedTransaction[]; page: number; totalPages: number; total: number }>(`/api/admin/bank-transfers/transactions?${query}`); const rows = txRes.data.transactions ?? []; setTransactions(rows); setPage(txRes.data.page ?? nextPage); setTotalPages(txRes.data.totalPages ?? 1); setTotal(txRes.data.total ?? rows.length); initEdits(rows); } catch { toast.error("فشل تحميل العمليات البنكية"); } finally { setTransactionsLoading(false); } }
  async function refreshBanksOnly() { try { const res = await axios.get<{ banks: Bank[]; supportedCurrencies: Currency[] }>("/api/admin/bank-transfers/banks"); setBanks(res.data.banks ?? []); setSupportedCurrencies(res.data.supportedCurrencies ?? supportedCurrencies); } catch {} }
  async function addBank() { if (!form.nameAr.trim()) return toast.error("اسم البنك بالعربية مطلوب"); setSaving(true); try { const res = await axios.post<{ banks: Bank[]; supportedCurrencies: Currency[] }>("/api/admin/bank-transfers/banks", { ...form, nameAr: form.nameAr.trim(), nameEn: form.nameEn.trim() || null, nameTr: form.nameTr.trim() || null, accountName: form.accountName.trim() || null, ibanLast4: form.ibanLast4.trim() || null }); setBanks(res.data.banks ?? []); setSupportedCurrencies(res.data.supportedCurrencies ?? supportedCurrencies); setForm(emptyForm); toast.success("تم إضافة البنك بنجاح"); } catch { toast.error("فشل إضافة البنك"); } finally { setSaving(false); } }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) { setStatementFile(event.target.files?.[0] ?? null); setPreview(null); setExcludedPreviewHashes(new Set()); }
  function buildFormData() { if (!statementFile || !selectedBank) return null; const fd = new FormData(); fd.append("file", statementFile); fd.append("bankId", selectedBank.id ?? selectedBank.code ?? ""); fd.append("currency", statementCurrency); fd.append("donorLocale", donorLocale); fd.append("excludedHashes", JSON.stringify([...excludedPreviewHashes])); return fd; }
  async function parsePreview() { const fd = buildFormData(); if (!fd) return toast.error("اختر البنك والملف أولًا"); setParsing(true); try { const res = await axios.post<PreviewResponse>("/api/admin/bank-transfers/preview", fd); setPreview(res.data); setExcludedPreviewHashes(new Set()); if (res.data.warning) toast(res.data.warning); toast.success(`تمت قراءة ${res.data.rowCount} صف`); } catch (e) { toast.error(axios.isAxiosError(e) && typeof e.response?.data?.error === "string" ? e.response.data.error : "فشل قراءة الملف"); } finally { setParsing(false); } }
  async function importStatement() { const fd = buildFormData(); if (!fd) return toast.error("اختر البنك والملف أولًا"); setImporting(true); try { const res = await axios.post<{ importedCount: number; duplicateCount: number; excludedCount?: number; warning: string | null }>("/api/admin/bank-transfers/import", fd); if (res.data.warning) toast(res.data.warning); toast.success(`تم إدخال ${res.data.importedCount} عملية للمراجعة، وتجاهل ${res.data.duplicateCount} مكررة، واستبعاد ${res.data.excludedCount ?? excludedPreviewHashes.size}`); setPreview(null); setExcludedPreviewHashes(new Set()); setStatementFile(null); await loadTransactions(filters, 1); await refreshBanksOnly(); } catch (e) { toast.error(axios.isAxiosError(e) && typeof e.response?.data?.error === "string" ? e.response.data.error : "فشل إدخال العمليات"); } finally { setImporting(false); } }
  function removePreviewRow(row: PreviewRow) { if (!row.transactionHash) return toast.error("لا يمكن حذف هذا الصف من الاستيراد لأنه لا يملك بصمة عملية واضحة"); setExcludedPreviewHashes((prev) => new Set([...prev, row.transactionHash!])); toast.success("تم حذف الصف من المعاينة"); }
  function setEdit(id: string, patch: Partial<EditState>) { setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } })); }
  function toggleSelected(id: string) { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleSelectAll() { setSelectedIds((prev) => { const next = new Set(prev); if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id)); return next; }); }
  async function reviewTransaction(tx: ImportedTransaction, status: "APPROVED" | "IGNORED" | "PENDING_REVIEW") { if (!tx.id) return; const edit = edits[tx.id] ?? { donorName: tx.donorName ?? "", donorLocale: tx.donorLocale || "ar", finalProject: tx.finalProject || tx.suggestedProject || "تبرع عام" }; setReviewingId(tx.id); try { await axios.patch(`/api/admin/bank-transfers/transactions/${tx.id}`, { ...edit, status }); const updated = { ...tx, ...edit, status, finalProject: edit.finalProject }; setTransactions((prev) => prev.map((item) => item.id === tx.id ? updated : item)); toast.success(status === "APPROVED" ? "تم اعتماد العملية" : status === "IGNORED" ? "تم استبعاد العملية" : "تم حفظ التعديل"); if (status === "APPROVED") void refreshBanksOnly(); } catch { toast.error("فشل تحديث العملية"); } finally { setReviewingId(null); } }
  async function bulkReview(status: "APPROVED" | "IGNORED" | "PENDING_REVIEW") { const ids = [...selectedIds]; if (!ids.length) return; setBulkBusy(true); try { await Promise.all(ids.map((id) => axios.patch(`/api/admin/bank-transfers/transactions/${id}`, { status }))); setTransactions((prev) => prev.map((tx) => tx.id && selectedIds.has(tx.id) ? { ...tx, status } : tx)); setSelectedIds(new Set()); toast.success(status === "APPROVED" ? "تم اعتماد العمليات المحددة" : status === "IGNORED" ? "تم استبعاد العمليات المحددة" : "تم حفظ المحدد للمراجعة"); void refreshBanksOnly(); } catch { toast.error("فشل تنفيذ الإجراء الجماعي"); } finally { setBulkBusy(false); } }
  async function deleteTransaction(tx: ImportedTransaction) { if (!tx.id) return; if (!window.confirm(`تأكيد حذف عملية ${tx.donorName || "بدون اسم"} بقيمة ${money(tx.amount, tx.currency)}؟`)) return; setReviewingId(tx.id); try { await axios.delete(`/api/admin/bank-transfers/transactions/${tx.id}`); setTransactions((prev) => prev.filter((item) => item.id !== tx.id)); toast.success("تم حذف العملية"); void refreshBanksOnly(); } catch { toast.error("فشل حذف العملية"); } finally { setReviewingId(null); } }
  function applyFilters() { setPage(1); void loadTransactions(filters, 1); }
  function resetFilters() { setFilters(defaultFilters); setPage(1); void loadTransactions(defaultFilters, 1); }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  const filterCount = [
    filters.q, filters.status !== "all" ? filters.status : "", filters.bankId !== "all" ? filters.bankId : "",
    filters.currency !== "all" ? filters.currency : "", filters.dateFrom, filters.dateTo,
    filters.amountMin, filters.amountMax,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        eyebrow="الإدارة المالية"
        title="التحويلات البنكية"
        description="ارفع كشف الحساب، راجع العمليات المقروءة، ثم اعتمد ما يجب احتسابه في الإجماليات."
        icon={Landmark}
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => loadTransactions(filters, page)} disabled={transactionsLoading}>
              <RefreshCw className={`h-4 w-4 ${transactionsLoading ? "animate-spin" : ""}`} />
              تحديث
            </Button>
            <a
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              href={`/api/admin/bank-transfers/export?${currentQuery}`}
            >
              <Download className="h-4 w-4" />
              تصدير Excel
            </a>
          </>
        }
      />

      {/* Work-waiting is the number that decides whether this page needs attention today, so it
          leads. The remaining counts are context, not peers. */}
      <MetricSummaryBand
        eyebrow="عمليات تنتظر المراجعة"
        value={String(pendingCount)}
        note={`من إجمالي ${total.toLocaleString("en-US")} عملية مطابقة للتصفية الحالية.`}
        stats={[
          { label: "معتمد في الصفحة", value: String(approvedCount) },
          { label: "مستبعد في الصفحة", value: String(ignoredCount) },
          { label: "البنوك النشطة", value: String(activeBanks.length) },
        ]}
      />

      {/* ── Step 1–3: import pipeline ─────────────────────────────────────────────
          Bank choice, file upload, preview and commit were three cards scattered down
          the page. They are one linear task, so they are one panel now, and the preview
          appears in place rather than several screens below the button that produced it. */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <Upload className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight text-slate-900">استيراد كشف حساب</h2>
              <p className="text-xs text-slate-500">الوارد فقط يدخل للمراجعة، والمكرر يُتجاهل تلقائيًا.</p>
            </div>
          </div>
          {statementFile && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              <FileText className="h-3.5 w-3.5" />
              {statementFile.name}
            </span>
          )}
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-600">البنك</Label>
              <Select
                value={selectedBankId}
                onValueChange={(v) => {
                  setSelectedBankId(v);
                  const bank = activeBanks.find((b) => b.id === v || b.code === v);
                  if (bank) setStatementCurrency(bank.currency);
                }}
              >
                <SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                <SelectContent>
                  {activeBanks.map((bank) => (
                    <SelectItem key={bank.id ?? bank.code ?? bank.nameAr} value={bank.id ?? bank.code ?? bank.nameAr}>
                      {bank.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-600">العملة</Label>
              <Select value={statementCurrency} onValueChange={(v) => setStatementCurrency(v)}>
                <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map((c) => <SelectItem key={c} value={c}>{currencyLabels[c] ?? c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-600">لغة المتبرعين</Label>
              <Select value={donorLocale} onValueChange={(v) => setDonorLocale(v)}>
                <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(localeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-3">
              <label className="group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3.5 transition-colors hover:border-brand/50 hover:bg-brand-50/40">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm transition-colors group-hover:text-brand">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-800">
                    {statementFile ? statementFile.name : "اختر ملف كشف الحساب"}
                  </span>
                  <span className="block text-[11px] text-slate-500">Excel أو CSV أو PDF</span>
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,application/pdf"
                  onChange={onFileChange}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-row gap-2 lg:flex-col lg:justify-end">
            <Button variant="outline" className="gap-2" onClick={parsePreview} disabled={parsing || !statementFile}>
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              معاينة
            </Button>
            <Button className="gap-2 bg-brand hover:bg-brand-dark" onClick={importStatement} disabled={importing || !statementFile}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              إدخال للمراجعة
            </Button>
          </div>
        </div>

        {/* Preview appears inline, directly under the controls that produced it. */}
        {preview && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {preview.fileName} • IBAN: {preview.bankIban ?? "لم يتم التقاطه"} • المعروض{" "}
                  <b className="tabular-nums text-slate-900">{visiblePreviewRows.length}</b> من{" "}
                  <b className="tabular-nums text-slate-900">{preview.rowCount}</b>
                  {excludedPreviewHashes.size > 0 && <> • محذوف <b className="tabular-nums">{excludedPreviewHashes.size}</b></>}
                </span>
                {preview.parser === "spreadsheet" && (() => {
                  const label = amountColumnLabel(preview.amountColumn);
                  return (
                    <span
                      className={
                        label.tone === "good"
                          ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                          : label.tone === "warn"
                          ? "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                          : "rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                      }
                    >
                      {label.text}
                    </span>
                  );
                })()}
              </span>
              {excludedPreviewHashes.size > 0 && (
                <Button size="sm" variant="outline" onClick={() => setExcludedPreviewHashes(new Set())}>
                  إعادة الصفوف المحذوفة
                </Button>
              )}
            </div>

            {preview.warning && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {preview.warning}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-right text-xs">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    {["#", "التاريخ", "الاسم", "الوصف", "القيمة", "الاتجاه", "المشروع", ""].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiblePreviewRows.slice(0, 100).map((row) => (
                    <tr key={previewRowKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-mono text-slate-400">{row.rowNumber}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{row.transactionDate ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{row.donorName ?? "—"}</td>
                      <td className="min-w-72 px-3 py-2.5 text-slate-500">{row.description}</td>
                      <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">{row.amount === null ? "—" : money(row.amount, row.currency)}</td>
                      <td className="px-3 py-2.5">{row.direction === "CREDIT" ? "وارد" : row.direction === "DEBIT" ? "صادر" : "غير محدد"}</td>
                      <td className="px-3 py-2.5">{row.suggestedProject}</td>
                      <td className="px-3 py-2.5">
                        <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => removePreviewRow(row)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!visiblePreviewRows.length && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <EmptyState
                          variant="inline"
                          icon={FileText}
                          title="لا توجد صفوف معروضة"
                          description="حُذفت كل الصفوف من المعاينة. استخدم «إعادة الصفوف المحذوفة» لاستعادتها."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Step 4: the review queue — the page's primary working surface ───────── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <CheckCircle2 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight text-slate-900">مراجعة العمليات</h2>
              <p className="text-xs text-slate-500">
                {transactionsLoading ? "جاري تطبيق الفلاتر…" : "عدّل البيانات ثم اعتمد ما يجب احتسابه في الإجماليات."}
              </p>
            </div>
          </div>
          <span className="text-xs tabular-nums text-slate-500">
            صفحة {page} من {totalPages} • {total.toLocaleString("en-US")} نتيجة
          </span>
        </header>

        {/* Filters, horizontal. Previously ten controls stacked inside a narrow column. */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="بحث باسم أو وصف أو مرجع"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                className="h-10 ps-9 text-[13px]"
              />
            </div>

            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="h-10 w-[150px] text-[13px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="PENDING_REVIEW">تحتاج مراجعة</SelectItem>
                <SelectItem value="APPROVED">معتمد</SelectItem>
                <SelectItem value="IMPORTED">مستورد/معتمد</SelectItem>
                <SelectItem value="IGNORED">مستبعد</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.bankId} onValueChange={(v) => setFilters((f) => ({ ...f, bankId: v }))}>
              <SelectTrigger className="h-10 w-[150px] text-[13px]"><SelectValue placeholder="البنك" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل البنوك</SelectItem>
                {activeBanks.map((bank) => (
                  <SelectItem key={bank.id ?? bank.code ?? bank.nameAr} value={bank.id ?? bank.code ?? bank.nameAr}>{bank.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.currency} onValueChange={(v) => setFilters((f) => ({ ...f, currency: v }))}>
              <SelectTrigger className="h-10 w-[140px] text-[13px]"><SelectValue placeholder="العملة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العملات</SelectItem>
                {supportedCurrencies.map((c) => <SelectItem key={c} value={c}>{currencyLabels[c] ?? c}</SelectItem>)}
              </SelectContent>
            </Select>

            <details className="group relative">
              <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300">
                تصفية متقدمة
                {filterCount > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white tabular-nums">{filterCount}</span>
                )}
              </summary>
              <div className="absolute end-0 z-20 mt-2 w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">من تاريخ</Label>
                    <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">إلى تاريخ</Label>
                    <Input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">قيمة من</Label>
                    <Input value={filters.amountMin} onChange={(e) => setFilters((f) => ({ ...f, amountMin: e.target.value }))} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">قيمة إلى</Label>
                    <Input value={filters.amountMax} onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value }))} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">لكل صفحة</Label>
                    <Select value={filters.limit} onValueChange={(v) => setFilters((f) => ({ ...f, limit: v }))}>
                      <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["25", "50", "100", "200"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">الترتيب</Label>
                    <Select value={filters.sortDir} onValueChange={(v) => setFilters((f) => ({ ...f, sortDir: v }))}>
                      <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">الأحدث/الأكبر</SelectItem>
                        <SelectItem value="asc">الأقدم/الأصغر</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </details>

            <Button className="h-10 gap-2 bg-brand hover:bg-brand-dark" onClick={applyFilters} disabled={transactionsLoading}>
              {transactionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              تطبيق
            </Button>
            <Button variant="ghost" className="h-10" onClick={resetFilters}>ضبط</Button>
          </div>
        </div>

        {/* Bulk bar only exists when a selection exists — no dead controls on screen. */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2.5">
            <span className="text-[13px] font-medium text-brand-800">تم تحديد {selectedIds.size} عملية</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={bulkBusy} onClick={() => bulkReview("APPROVED")}>اعتماد المحدد</Button>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulkReview("IGNORED")}>استبعاد المحدد</Button>
              <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-xs">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="تحديد الكل" />
                </th>
                {["الحالة", "التاريخ", "الاسم", "البنك", "القيمة", "اللغة", "المشروع", "الوصف", "إجراءات"].map((h) => (
                  <th key={h} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const edit = tx.id ? edits[tx.id] : undefined;
                return (
                  <tr key={tx.id ?? tx.reference ?? `${tx.donorName}-${tx.amount}`} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      {tx.id && <input type="checkbox" checked={selectedIds.has(tx.id)} onChange={() => toggleSelected(tx.id!)} />}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusClass(tx.status)}`}>{statusLabel(tx.status)}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{tx.transactionDate || "—"}</td>
                    <td className="min-w-44 px-3 py-3">
                      <Input className="h-9 text-xs" value={edit?.donorName ?? ""} onChange={(e) => tx.id && setEdit(tx.id, { donorName: e.target.value })} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-600">{tx.bankId || "—"}</td>
                    <td className="px-3 py-3 font-mono tabular-nums whitespace-nowrap font-semibold text-slate-900">{money(tx.amount, tx.currency)}</td>
                    <td className="min-w-32 px-3 py-3">
                      <Select value={edit?.donorLocale ?? tx.donorLocale ?? "ar"} onValueChange={(v) => tx.id && setEdit(tx.id, { donorLocale: v })}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(localeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="min-w-56 px-3 py-3">
                      <Input
                        className="h-9 text-xs"
                        value={edit?.finalProject ?? tx.finalProject ?? tx.suggestedProject ?? ""}
                        onChange={(e) => tx.id && setEdit(tx.id, { finalProject: e.target.value })}
                      />
                    </td>
                    <td className="min-w-72 px-3 py-3 text-slate-500">
                      <div className="line-clamp-2">{tx.description}</div>
                      {tx.reference && <div className="mt-1 font-mono text-[10px] text-slate-400">{tx.reference}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {tx.id && (
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" disabled={reviewingId === tx.id} onClick={() => reviewTransaction(tx, "PENDING_REVIEW")}>حفظ</Button>
                          <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={reviewingId === tx.id} onClick={() => reviewTransaction(tx, "APPROVED")}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" disabled={reviewingId === tx.id} onClick={() => reviewTransaction(tx, "IGNORED")}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" disabled={reviewingId === tx.id} onClick={() => deleteTransaction(tx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!transactions.length && (
                <tr>
                  <td colSpan={10} className="p-0">
                    <EmptyState
                      variant="inline"
                      icon={Search}
                      title="لا توجد عمليات مطابقة"
                      description="لا توجد عملية تطابق الفلاتر الحالية. جرّب توسيع النطاق الزمني أو اختيار «كل الحالات»."
                      action={<Button size="sm" variant="outline" onClick={resetFilters}>إعادة ضبط الفلاتر</Button>}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-[13px] text-slate-600">
          <span className="tabular-nums">صفحة {page} من {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || transactionsLoading} onClick={() => { const next = page - 1; setPage(next); void loadTransactions(filters, next); }}>السابق</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || transactionsLoading} onClick={() => { const next = page + 1; setPage(next); void loadTransactions(filters, next); }}>التالي</Button>
          </div>
        </div>
      </section>

      {/* ── Bank administration — collapsed by default ───────────────────────────
          Adding a bank happens rarely; it previously held a third of the page permanently. */}
      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Building2 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight text-slate-900">الحسابات البنكية</h2>
              <p className="text-xs text-slate-500">{activeBanks.length} حساب نشط • إجماليات وإضافة حساب جديد</p>
            </div>
          </div>
          <span className="text-xs font-medium text-brand transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            {activeBanks.map((bank) => {
              const s = bank.stats ?? { operationCount: 0, totals: {}, localeTotals: {} };
              return (
                <div key={bank.id ?? bank.code ?? bank.nameAr} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-900">{bank.nameAr}</p>
                      <p className="truncate text-xs text-slate-500">{bank.nameTr || bank.nameEn || bank.code || "حساب بنكي"}</p>
                    </div>
                    <span className="rounded-lg bg-brand-50 p-2 text-brand"><Building2 className="h-4 w-4" /></span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "دولار", value: money(s.totals.USD, "USD") },
                      { label: "ليرة", value: money(s.totals.TRY, "TRY") },
                      { label: "عمليات", value: String(s.operationCount) },
                    ].map((cell) => (
                      <div key={cell.label} className="rounded-lg bg-slate-50 p-2.5">
                        <p className="text-[10px] text-slate-500">{cell.label}</p>
                        <p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-slate-900">{cell.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">العملة الافتراضية: <span className="font-mono">{bank.currency}</span></p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-slate-400" />
              <h3 className="text-[13px] font-semibold text-slate-800">إضافة حساب بنكي جديد</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input placeholder="اسم البنك بالعربية" value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} className="h-10 text-[13px]" />
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {supportedCurrencies.map((c) => <SelectItem key={c} value={c}>{currencyLabels[c] ?? c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="الاسم بالتركية" value={form.nameTr} onChange={(e) => setForm((f) => ({ ...f, nameTr: e.target.value }))} className="h-10 text-[13px]" />
              <Input placeholder="الاسم بالإنجليزية" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} className="h-10 text-[13px]" />
              <Input placeholder="اسم الحساب" value={form.accountName} onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))} className="h-10 text-[13px]" />
              <Input placeholder="آخر 4 من IBAN" value={form.ibanLast4} onChange={(e) => setForm((f) => ({ ...f, ibanLast4: e.target.value }))} className="h-10 text-[13px]" />
            </div>
            <Button className="mt-3 gap-2 bg-brand hover:bg-brand-dark" onClick={addBank} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              إضافة البنك
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}
