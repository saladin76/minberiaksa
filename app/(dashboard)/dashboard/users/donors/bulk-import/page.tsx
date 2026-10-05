"use client";

import * as React from "react";
import Link from "next/link";
import { UploadCloud, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { ImportRowInput } from "@/lib/donations/bulk-import";

type PreviewRow = {
  rowNumber: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  basket: string | null;
  amount: number | null;
  currency: string;
  amountUSD: number | null;
  status: "PAID" | "FAILED";
  country: string | null;
  countryCode: string | null;
  locale: string;
  createdAtISO: string | null;
  valid: boolean;
  issues: string[];
  alreadyImported: boolean;
  isNewDonor: boolean;
};

type PreviewResponse = {
  warnings: string[];
  summary: {
    totalRows: number; validRows: number; invalidRows: number;
    paid: number; failed: number; alreadyImported: number; newlyImportable: number;
    newDonors: number; existingDonors: number; totalUsdPaidNew: number;
    byCurrency: Record<string, { count: number; amount: number }>;
  };
  sample: PreviewRow[];
  sampleTruncated: boolean;
};

type CommitResult = { createdDonations: number; createdDonors: number; linkedExistingDonors: number; skippedRows: number };

type BatchResponse = {
  ok: true; createdDonations: number; createdDonors: number; linkedExistingDonors: number;
  alreadyImported: number; unresolved: number; rejected: number;
};

/**
 * The file is parsed HERE, in the browser, and rows go to the server in batches. Posting the whole
 * workbook hit Vercel's 4.5MB request-body limit, and importing it in one request hit the function
 * timeout  so big files failed and never imported.
 */
type ImportState = {
  runId: string;
  fileHash: string;
  totalRows: number;
  validRows: number;
  rows: ImportRowInput[];
  nextIndex: number;
  totals: CommitResult;
};

const API = "/api/admin/donations/bulk-import";
const EMAIL_BATCH = 2000;
const IMPORT_BATCH = 400;
const SAMPLE_LIMIT = 500;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function newRunId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST JSON, retrying transient failures (network, 5xx, timeouts) with backoff. 4xx is final. */
async function postJson<T>(url: string, body: unknown, attempts = 4): Promise<T> {
  let lastError = "تعذّر الاتصال بالخادم.";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (res.ok) return j as T;
      lastError = j?.error ?? `خطأ من الخادم (${res.status}).`;
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch {
      lastError = "تعذّر الاتصال بالخادم.";
    }
  }
  throw new Error(lastError);
}
const num = (n: number) => n.toLocaleString("ar");
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—");

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}

export default function BulkDonationImportPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "commit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [result, setResult] = React.useState<CommitResult | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number; label: string } | null>(null);
  /** The parsed rows + how far the import got; kept so a failed import can resume where it stopped. */
  const importRef = React.useRef<ImportState | null>(null);
  const [canResume, setCanResume] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setPreview(null); setResult(null); setError(null); setProgress(null); setCanResume(false);
    importRef.current = null;
  }

  function onPick(f: File | null) {
    setFile(f);
    reset();
  }

  async function runPreview() {
    if (!file) return;
    reset();
    if (file.size > MAX_FILE_BYTES) { setError("حجم الملف كبير جدًا (الحد 100MB). قسّمه إلى ملفين."); return; }
    setBusy("preview");
    try {
      setProgress({ done: 0, total: 0, label: "جارٍ قراءة الملف…" });
      // Let the label paint before the (synchronous) parse occupies the main thread.
      await new Promise((r) => setTimeout(r, 30));
      const { parseDonationImportBuffer, toImportRowInput } = await import("@/lib/donations/bulk-import");
      const parsed = parseDonationImportBuffer(await file.arrayBuffer());
      if (parsed.totalRows === 0) { setError(parsed.warnings[0] ?? "لا توجد صفوف قابلة للاستيراد في الملف."); return; }

      const valid = parsed.rows.filter((r) => r.valid);
      const emails = [...new Set(valid.map((r) => r.email).filter(Boolean) as string[])];

      // Donor dedup by email only. Donations are NOT deduped  every valid row (incl. repeats) imports.
      const existing = new Set<string>();
      for (let i = 0; i < emails.length; i += EMAIL_BATCH) {
        setProgress({ done: i, total: emails.length, label: "التحقق من المتبرعين الحاليين…" });
        const j = await postJson<{ existing: string[] }>(`${API}/preview`, { emails: emails.slice(i, i + EMAIL_BATCH) });
        for (const e of j.existing) existing.add(e);
      }

      const byCurrency: Record<string, { count: number; amount: number }> = {};
      let totalUsdPaid = 0;
      let paid = 0;
      for (const r of valid) {
        if (r.status === "PAID") { paid += 1; totalUsdPaid += r.amountUSD ?? 0; }
        const c = byCurrency[r.currency] ?? { count: 0, amount: 0 };
        c.count += 1; c.amount += r.amount ?? 0;
        byCurrency[r.currency] = c;
      }
      const newDonors = emails.filter((e) => !existing.has(e)).length;

      importRef.current = {
        runId: newRunId(),
        fileHash: parsed.fileHash,
        totalRows: parsed.totalRows,
        validRows: valid.length,
        rows: valid.map(toImportRowInput),
        nextIndex: 0,
        totals: { createdDonations: 0, createdDonors: 0, linkedExistingDonors: 0, skippedRows: 0 },
      };
      setPreview({
        warnings: parsed.warnings,
        summary: {
          totalRows: parsed.totalRows,
          validRows: valid.length,
          invalidRows: parsed.totalRows - valid.length,
          paid,
          failed: valid.length - paid,
          alreadyImported: 0,
          newlyImportable: valid.length,
          newDonors,
          existingDonors: emails.length - newDonors,
          totalUsdPaidNew: Math.round(totalUsdPaid * 100) / 100,
          byCurrency,
        },
        sample: parsed.rows.slice(0, SAMPLE_LIMIT).map((r) => ({
          rowNumber: r.rowNumber, name: r.name, email: r.email, phone: r.phone, basket: r.basket,
          amount: r.amount, currency: r.currency, amountUSD: r.amountUSD, status: r.status,
          country: r.country, countryCode: r.countryCode, locale: r.locale, createdAtISO: r.createdAtISO,
          valid: r.valid, issues: r.issues, alreadyImported: false,
          isNewDonor: !!r.email && !existing.has(r.email),
        })),
        sampleTruncated: parsed.rows.length > SAMPLE_LIMIT,
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "تعذّرت قراءة الملف. تأكد أنه Excel (.xlsx) أو CSV صالح.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function runImport(resume = false) {
    const state = importRef.current;
    if (!state || !preview) return;
    if (!resume && !window.confirm(`سيتم إنشاء ${preview.summary.newlyImportable} تبرع و ${preview.summary.newDonors} متبرع جديد. متابعة؟`)) return;
    setBusy("commit"); setError(null); setCanResume(false);
    try {
      // Batches run in order; each is retried, and retries of the same run are idempotent on the server.
      while (state.nextIndex < state.rows.length) {
        setProgress({ done: state.nextIndex, total: state.rows.length, label: "جارٍ الاستيراد…" });
        const batch = state.rows.slice(state.nextIndex, state.nextIndex + IMPORT_BATCH);
        const j = await postJson<BatchResponse>(`${API}/commit`, { runId: state.runId, rows: batch });
        state.totals.createdDonations += j.createdDonations + j.alreadyImported;
        state.totals.createdDonors += j.createdDonors;
        state.totals.linkedExistingDonors += j.linkedExistingDonors;
        state.totals.skippedRows += j.rejected + j.unresolved;
        state.nextIndex += batch.length;
      }
      setProgress({ done: state.rows.length, total: state.rows.length, label: "جارٍ إنهاء الاستيراد…" });
      const fin = await postJson<{ createdDonations: number }>(`${API}/commit`, {
        runId: state.runId,
        finalize: { fileHash: state.fileHash, totalRows: state.totalRows, validRows: state.validRows, createdDonors: state.totals.createdDonors, skippedRows: state.totals.skippedRows },
      }).catch(() => null);
      // Per-batch "existing" counts would re-count donors created by an earlier batch; the preview's figure is exact.
      setResult({ ...state.totals, linkedExistingDonors: preview.summary.existingDonors, createdDonations: fin?.createdDonations ?? state.totals.createdDonations });
      importRef.current = null;
    } catch (e) {
      const done = state.nextIndex;
      setError(`${e instanceof Error ? e.message : "تعذّر الاستيراد."}  تم استيراد ${num(done)} من ${num(state.rows.length)} صف. اضغط «متابعة الاستيراد» لإكمال الباقي دون تكرار.`);
      setCanResume(true);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const s = preview?.summary;

  return (
    <main className="mx-auto max-w-5xl space-y-5" dir="rtl">
      {/* Compact header */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold text-brand">المتبرعون / توريد بالجملة</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">توريد التبرعات من Excel / CSV</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">
              ارفع ملف مبيعات (مثل تصدير PayFor) لإنشاء تبرعات مرتبطة بالمتبرعين عبر البريد الإلكتروني. تُعرض معاينة قبل الحفظ، ولا يُرسل أي إشعار.
            </p>
          </div>
          <Link href="/dashboard/users/donors" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-brand/50 hover:text-brand">
            العودة للمتبرعين <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <FileSpreadsheet className="h-8 w-8 text-brand" />
          <div>
            <p className="text-sm font-bold text-slate-800">{file ? file.name : "اختر ملف Excel (.xlsx) أو CSV"}</p>
            <p className="mt-1 text-xs text-slate-500">الأعمدة المدعومة: EPOSTA، AD SOYAD، TELEFON، SEPET، TOPLAM، PARA BİRİMİ، USD HALİ، DURUM، TARİH SAAT، ÜLKE، SİTE DİL …</p>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand/50 hover:text-brand">
              <UploadCloud className="h-4 w-4" /> اختيار ملف
            </button>
            <button type="button" disabled={!file || busy !== null} onClick={runPreview} className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
              {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} معاينة الملف
            </button>
          </div>
        </div>
        {progress ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.label}</span>
              {progress.total > 0 ? <span dir="ltr">{num(progress.done)} / {num(progress.total)}</span> : null}
            </div>
            {progress.total > 0 ? (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="flex-1">{error}</span>
            {canResume ? (
              <button type="button" disabled={busy !== null} onClick={() => runImport(true)} className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                متابعة الاستيراد
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Preview */}
      {s ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="صفوف صالحة" value={num(s.validRows)} tone="ok" />
            <Stat label="ستُضاف كلها" value={num(s.newlyImportable)} tone="ok" />
            <Stat label="متبرعون جدد" value={num(s.newDonors)} />
            <Stat label="إجمالي المبلغ (USD) الناجح" value={`$${num(s.totalUsdPaidNew)}`} tone="ok" />
            <Stat label="ناجحة" value={num(s.paid)} tone="ok" />
            <Stat label="فاشلة" value={num(s.failed)} tone={s.failed > 0 ? "warn" : undefined} />
            <Stat label="صفوف غير صالحة" value={num(s.invalidRows)} tone={s.invalidRows > 0 ? "bad" : undefined} />
          </section>

          {preview!.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-800">
              {preview!.warnings.map((w, i) => <p key={i} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
            </div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-sm font-black text-slate-800">معاينة الصفوف {preview!.sampleTruncated ? "(أول 500 صف)" : ""}</h2>
              <button type="button" disabled={s.newlyImportable === 0 || busy !== null || canResume || !!result} onClick={() => runImport()}className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                {busy === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} استيراد {num(s.newlyImportable)} تبرع
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="border-b bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="p-2.5 text-right font-semibold">#</th>
                    <th className="p-2.5 text-right font-semibold">الاسم</th>
                    <th className="p-2.5 text-right font-semibold">البريد</th>
                    <th className="p-2.5 text-right font-semibold">السلة</th>
                    <th className="p-2.5 text-center font-semibold">المبلغ</th>
                    <th className="p-2.5 text-center font-semibold">USD</th>
                    <th className="p-2.5 text-center font-semibold">الحالة</th>
                    <th className="p-2.5 text-center font-semibold">الدولة</th>
                    <th className="p-2.5 text-center font-semibold">التاريخ</th>
                    <th className="p-2.5 text-center font-semibold">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {preview!.sample.map((r) => (
                    <tr key={r.rowNumber} className={`border-b last:border-0 ${!r.valid ? "bg-rose-50/40" : ""}`}>
                      <td className="p-2.5 text-slate-400">{r.rowNumber}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{r.name ?? "—"}</td>
                      <td className="p-2.5 text-slate-600" dir="ltr">{r.email ?? "—"}{r.isNewDonor && r.valid ? <span className="ms-1 rounded bg-blue-50 px-1 text-[10px] font-bold text-brand">جديد</span> : null}</td>
                      <td className="p-2.5 text-slate-600">{r.basket ?? "—"}</td>
                      <td className="p-2.5 text-center text-slate-700" dir="ltr">{r.amount ?? "—"} {r.currency}</td>
                      <td className="p-2.5 text-center text-slate-700" dir="ltr">{r.amountUSD ?? "—"}</td>
                      <td className="p-2.5 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${r.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{r.status === "PAID" ? "ناجح" : "فاشل"}</span>
                      </td>
                      <td className="p-2.5 text-center text-slate-600">{r.country ?? "—"}{r.countryCode ? ` (${r.countryCode})` : ""}</td>
                      <td className="p-2.5 text-center text-slate-500" dir="ltr">{fmtDate(r.createdAtISO)}</td>
                      <td className="p-2.5 text-center text-[11px]">
                        {!r.valid ? <span className="font-semibold text-rose-600">{r.issues.join("، ")}</span>
                          : <span className="text-emerald-600">جاهز</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {/* Result */}
      {result ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="flex items-center gap-2 text-base font-black text-emerald-800"><CheckCircle2 className="h-5 w-5" /> تم الاستيراد بنجاح</p>
          <div className="mt-3 grid gap-2 text-sm text-emerald-900 sm:grid-cols-2">
            <p>تبرعات أُنشئت: <b>{num(result.createdDonations)}</b></p>
            <p>متبرعون جدد: <b>{num(result.createdDonors)}</b></p>
            <p>مرتبطة بمتبرعين حاليين: <b>{num(result.linkedExistingDonors)}</b></p>
          </div>
          {result.skippedRows > 0 ? <p className="mt-2 text-xs font-semibold text-amber-700">تم تخطّي {num(result.skippedRows)} صف لم يجتز التحقق على الخادم.</p> : null}
          <div className="mt-4 flex gap-2">
            <Link href="/dashboard/users/donors" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-700">عرض المتبرعين</Link>
            <button type="button" onClick={() => { onPick(null); if (inputRef.current) inputRef.current.value = ""; }} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">استيراد ملف آخر</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
