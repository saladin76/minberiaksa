"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type UploadRow = { id: string | null; bankId: string | null; fileName: string; bankIban: string | null; currency: string; donorLocale: string; parser: string; uploadedByName: string | null; rowCount: number; creditRowCount: number; importedCount: number; duplicateCount: number; excludedCount: number; createdAt: string | null };
const localeLabels: Record<string, string> = { ar: "عربي", tr: "تركي", en: "إنجليزي", fr: "فرنسي", de: "ألماني", es: "إسباني", pt: "برتغالي", id: "إندونيسي" };

function ensureNode() {
  const h1 = document.querySelector("main h1");
  if (!h1 || !h1.textContent?.includes("التحويلات البنكية")) return null;
  const exportNode = document.getElementById("bank-transfers-export-panel");
  const anchor = exportNode ?? (h1.closest("div.flex") as HTMLElement | null);
  const parent = anchor?.parentElement;
  if (!anchor || !parent) return null;
  let node = document.getElementById("bank-transfers-uploads-panel");
  if (!node) { node = document.createElement("div"); node.id = "bank-transfers-uploads-panel"; node.dir = "rtl"; }
  if (node.parentElement !== parent || node.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", node);
  return node;
}
function dateText(value: string | null) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar", { dateStyle: "short", timeStyle: "short" }); }

export function BankTransfersUploadsPanel() {
  const pathname = usePathname();
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const active = pathname === "/dashboard/bank-transfers" || pathname.startsWith("/dashboard/bank-transfers/");
  const ids = uploads.map((u) => u.id).filter((id): id is string => Boolean(id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  async function loadUploads() {
    setLoading(true);
    try { const res = await fetch("/api/admin/bank-transfers/uploads", { cache: "no-store" }); const data = res.ok ? await res.json() : null; setUploads(Array.isArray(data?.uploads) ? data.uploads : []); }
    catch { setUploads([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!active) { setNode(null); return; } const refresh = () => setNode(ensureNode()); refresh(); const timer = window.setInterval(refresh, 700); void loadUploads(); return () => window.clearInterval(timer); }, [active, pathname]);
  useEffect(() => { setSelected((prev) => new Set([...prev].filter((id) => ids.includes(id)))); }, [uploads.length]);

  const totals = useMemo(() => uploads.reduce((acc, item) => { acc.imported += item.importedCount || 0; acc.duplicate += item.duplicateCount || 0; acc.excluded += item.excludedCount || 0; return acc; }, { imported: 0, duplicate: 0, excluded: 0 }), [uploads]);
  function toggleOne(id: string) { setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleAll() { setSelected((prev) => { const next = new Set(prev); allSelected ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id)); return next; }); }
  async function deleteSelected() {
    const selectedIds = [...selected]; if (!selectedIds.length) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/bank-transfers/uploads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedIds }) });
      if (!res.ok) throw new Error("delete failed");
      setUploads((prev) => prev.filter((u) => !u.id || !selected.has(u.id)));
      setSelected(new Set()); setConfirmOpen(false);
      window.dispatchEvent(new CustomEvent("bank-transfers:uploads-deleted"));
    } catch { alert("فشل حذف الكشوفات المحددة"); }
    finally { setDeleting(false); }
  }
  if (!active || !node) return null;

  return createPortal(<>
    {confirmOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-bold text-slate-900">تأكيد حذف الكشوفات</h2><p className="mt-2 text-sm text-slate-600">سيتم حذف {selected.size} كشف حساب مرفوع، وسيتم حذف العمليات المرتبطة بهذه الكشوفات من لوحة المتبرعين البنكيين.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={deleting} onClick={() => setConfirmOpen(false)}>إلغاء</Button><Button className="bg-rose-600 hover:bg-rose-700" disabled={deleting} onClick={deleteSelected}>{deleting ? "جاري الحذف..." : "تأكيد الحذف"}</Button></div></div></div> : null}
    <Card className="mb-4">
      <CardHeader className="pb-3"><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><CardTitle className="text-base">سجل الكشوفات المرفوعة</CardTitle><CardDescription>آخر الكشوفات مع أعداد المستورد والمكرر والمستبعد. يمكن طي السجل أو حذف كشوفات محددة.</CardDescription></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>{open ? "طي السجل" : "عرض السجل"}</Button><Button size="sm" variant="outline" onClick={loadUploads} disabled={loading}>{loading ? "جاري التحديث..." : "تحديث"}</Button></div></div></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 text-xs md:grid-cols-4"><div className="rounded-lg border bg-slate-50 p-3">الكشوفات: <b>{uploads.length}</b></div><div className="rounded-lg border bg-slate-50 p-3">المستورد: <b>{totals.imported}</b></div><div className="rounded-lg border bg-slate-50 p-3">المكرر: <b>{totals.duplicate}</b></div><div className="rounded-lg border bg-slate-50 p-3">المستبعد: <b>{totals.excluded}</b></div></div>
        {selected.size > 0 ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-rose-50 p-3 text-xs text-rose-900"><span>تم تحديد {selected.size} كشف</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button><Button size="sm" className="bg-rose-600 hover:bg-rose-700" onClick={() => setConfirmOpen(true)}>حذف المحدد</Button></div></div> : null}
        {open ? <div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-right text-xs"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th className="p-2">تاريخ الرفع</th><th className="p-2">الملف</th><th className="p-2">البنك</th><th className="p-2">IBAN</th><th className="p-2">العملة</th><th className="p-2">لغة المتبرعين</th><th className="p-2">الوارد</th><th className="p-2">المستورد</th><th className="p-2">المكرر</th><th className="p-2">المستبعد</th></tr></thead><tbody>{uploads.length ? uploads.map((row) => <tr key={row.id ?? `${row.fileName}-${row.createdAt}`} className="border-t align-top"><td className="p-2">{row.id ? <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id!)} /> : null}</td><td className="p-2 whitespace-nowrap">{dateText(row.createdAt)}</td><td className="p-2 min-w-40">{row.fileName}</td><td className="p-2 min-w-32">{row.bankId ?? "-"}</td><td className="p-2 font-mono">{row.bankIban ?? "-"}</td><td className="p-2 font-mono">{row.currency}</td><td className="p-2">{localeLabels[row.donorLocale] ?? row.donorLocale}</td><td className="p-2 font-mono">{row.creditRowCount}</td><td className="p-2 font-mono text-emerald-700">{row.importedCount}</td><td className="p-2 font-mono text-amber-700">{row.duplicateCount}</td><td className="p-2 font-mono text-slate-600">{row.excludedCount}</td></tr>) : <tr><td colSpan={11} className="p-0"><EmptyState variant="inline" icon={Upload} title="لا توجد كشوفات مرفوعة بعد" description="ارفع كشف حساب بنكي من لوحة «رفع كشف الحساب» ليظهر سجل الرفع هنا." /></td></tr>}</tbody></table></div> : null}
      </CardContent>
    </Card>
  </>, node);
}
