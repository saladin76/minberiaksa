"use client";

import * as React from "react";
import Link from "next/link";
import { UploadCloud, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";

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

type CommitResponse = {
  ok: true; createdDonations: number; createdDonors: number; linkedExistingDonors: number;
  skippedDuplicate: number; unresolved: number; truncated: boolean; warnings: string[];
};

const API = "/api/admin/donations/bulk-import";
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
  const [result, setResult] = React.useState<CommitResponse | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setPreview(null); setResult(null); setError(null);
  }

  function onPick(f: File | null) {
    setFile(f);
    reset();
  }

  async function runPreview() {
    if (!file) return;
    setBusy("preview"); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/preview`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setError(j?.error ?? "تعذّرت المعاينة."); setPreview(null); return; }
      setPreview(j as PreviewResponse);
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!file || !preview) return;
    if (!window.confirm(`سيتم إنشاء ${preview.summary.newlyImportable} تبرع و ${preview.summary.newDonors} متبرع جديد. متابعة؟`)) return;
    setBusy("commit"); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/commit`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setError(j?.error ?? "تعذّر الاستيراد."); return; }
      setResult(j as CommitResponse);
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    } finally {
      setBusy(null);
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
        {error ? <p className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> {error}</p> : null}
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
              <button type="button" disabled={s.newlyImportable === 0 || busy !== null} onClick={runImport} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
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
          {result.truncated ? <p className="mt-2 text-xs font-semibold text-amber-700">تم استيراد أول 5000 صف فقط في هذه الدفعة — أعد رفع الملف لاستيراد الباقي.</p> : null}
          <div className="mt-4 flex gap-2">
            <Link href="/dashboard/users/donors" className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-sm font-bold text-white hover:bg-brand-700">عرض المتبرعين</Link>
            <button type="button" onClick={() => { onPick(null); if (inputRef.current) inputRef.current.value = ""; }} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">استيراد ملف آخر</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
