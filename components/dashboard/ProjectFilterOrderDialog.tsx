"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dt, dtMaybe } from "@/lib/dashboard/i18n";

type Item = { key: string; kind: "category" | "programme"; name: string };
export function ProjectFilterOrderDialog({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<Item[]>([]), [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError(""); setMessage(""); setRevision("");
    try {
      const response = await fetch(`/api/admin/project-filters?locale=${encodeURIComponent(locale)}`, { cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? dt("يلزم إذن إدارة التصنيفات ومحتوى الموقع لترتيب القائمة الموحدة") : body.error || dt("تعذر تحميل ترتيب فلاتر المشاريع"));
      setItems(body.items); setRevision(body.revision);
    } catch (failure) { setError(failure instanceof Error ? dtMaybe(failure.message) : dt("تعذر تحميل ترتيب فلاتر المشاريع")); }
    finally { setLoading(false); }
  };
  const move = (from: number, to: number) => { setMessage(""); setItems(previous => { const next = [...previous]; next.splice(Math.max(0, Math.min(previous.length - 1, to)), 0, next.splice(from, 1)[0]); return next; }); };
  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/project-filters", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, keys: items.map(item => item.key) }) }); const body = await response.json();
      if (!response.ok) throw new Error(body.error || dt("تعذر حفظ ترتيب فلاتر المشاريع"));
      setMessage(dt("تم حفظ ترتيب صفحة المشاريع")); setRevision("");
    } catch (failure) { setError(failure instanceof Error ? dtMaybe(failure.message) : dt("تعذر حفظ ترتيب فلاتر المشاريع")); }
    finally { setSaving(false); }
  };
  return <>
    <Button variant="outline" className="gap-2" onClick={() => { setOpen(true); void load(); }}><ListOrdered size={16}/>{dt("ترتيب فلاتر صفحة المشاريع")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}><DialogContent className="max-h-[90vh] min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto">
      <DialogHeader className="pe-6 text-start sm:text-start"><DialogTitle>{dt("ترتيب فلاتر صفحة المشاريع")}</DialogTitle></DialogHeader>
      <p className="text-sm leading-7 text-muted-foreground">{dt("قائمة واحدة للتصنيفات والمشاريع الكبرى المنشورة. اكتب رقم الموضع أو استخدم الأسهم؛ العناصر الجديدة تضاف تلقائيًا في النهاية.")}</p>
      {loading ? <p role="status" className="flex gap-2"><Loader2 className="animate-spin" size={18}/>{dt("جار التحميل…")}</p> : <ol className="space-y-2">{items.map((item, index) => <li key={item.key} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border p-3">
        <div className="min-w-0 flex-1"><span className="block break-words font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.kind === "category" ? dt("تصنيف") : dt("مشروع كبير")}</span></div>
        <input key={`${item.key}:${index}`} type="number" min={1} max={items.length} defaultValue={index + 1} aria-label={dt("موضع {0}", [item.name])} disabled={saving || !revision} className="w-16 min-w-0 rounded-lg border p-2 text-center" onBlur={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= items.length) move(index, value - 1); else event.target.value = String(index + 1); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}/>
        <Button size="icon" variant="outline" disabled={saving || !revision || index === 0} aria-label={dt("تقديم {0}", [item.name])} onClick={() => move(index, index - 1)}><ArrowUp size={16}/></Button>
        <Button size="icon" variant="outline" disabled={saving || !revision || index === items.length - 1} aria-label={dt("تأخير {0}", [item.name])} onClick={() => move(index, index + 1)}><ArrowDown size={16}/></Button>
      </li>)}</ol>}
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={loading || saving || !revision} onClick={() => void save()}>{saving ? dt("جار الحفظ…") : dt("حفظ الترتيب")}</Button><Button variant="outline" disabled={loading || saving} onClick={() => void load()}>{dt("إعادة تحميل القائمة")}</Button></div>
    </DialogContent></Dialog>
  </>;
}
