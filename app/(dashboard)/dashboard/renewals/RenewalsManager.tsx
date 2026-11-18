"use client";
import { useCallback, useEffect, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
import { daysLeft, renewalLevel, type RenewalCycle, type RenewalLevel, type ServiceRenewal } from "@/lib/service-renewals/shared";

const API = "/api/admin/service-renewals";
type Draft = { id?: string; name: string; provider: string; renewsAt: string; cycle: RenewalCycle; amount: string; currency: string; cardLast4: string; owner: string; billingUrl: string; notes: string };
const EMPTY: Draft = { name: "", provider: "", renewsAt: "", cycle: "MONTHLY", amount: "", currency: "USD", cardLast4: "", owner: "", billingUrl: "", notes: "" };
const BADGE: Record<RenewalLevel, string> = { OVERDUE: "bg-red-600 text-white", URGENT: "bg-red-100 text-red-800", NEAR: "bg-orange-100 text-orange-800", SOON: "bg-amber-100 text-amber-800", NONE: "bg-emerald-100 text-emerald-800", NO_DATE: "bg-slate-200 text-slate-700" };
const cycleLabel = (c: RenewalCycle) => (c === "MONTHLY" ? dt("شهري") : c === "YEARLY" ? dt("سنوي") : dt("مرة واحدة"));

/** Paid services the site depends on: when each renews, and confirming each renewal. */
export default function RenewalsManager() {
  const [items, setItems] = useState<ServiceRenewal[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try { const r = await fetch(API, { cache: "no-store" }); if (!r.ok) throw new Error(); setItems(((await r.json()) as { items: ServiceRenewal[] }).items); }
    catch { setError(dt("تعذر تحميل التجديدات")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(API + query, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) { const e = (await r.json().catch(() => ({}))) as { error?: string }; throw new Error(e.error || ""); }
      await load(); return true;
    } catch (e) { setError(dt("تعذر الحفظ") + (e instanceof Error && e.message ? ` (${e.message})` : "")); return false; }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!draft) return;
    const body = { ...(draft.id ? { id: draft.id } : {}), name: draft.name, provider: draft.provider, renewsAt: draft.renewsAt || null, cycle: draft.cycle,
      amount: draft.amount.trim() ? Number(draft.amount) : null, currency: draft.currency || null, cardLast4: draft.cardLast4 || null, owner: draft.owner || null, billingUrl: draft.billingUrl || null, notes: draft.notes || null };
    if (await call(draft.id ? "PATCH" : "POST", body)) { setDraft(null); setNotice(dt("تم الحفظ")); }
  };
  const edit = (i: ServiceRenewal) => setDraft({ id: i.id, name: i.name, provider: i.provider, renewsAt: i.renewsAt ?? "", cycle: i.cycle, amount: i.amount != null ? String(i.amount) : "", currency: i.currency ?? "USD", cardLast4: i.cardLast4 ?? "", owner: i.owner ?? "", billingUrl: i.billingUrl ?? "", notes: i.notes ?? "" });
  const status = (i: ServiceRenewal) => {
    const level = renewalLevel(i);
    if (level === "NO_DATE") return [level, dt("حدد تاريخ التجديد")] as const;
    const d = daysLeft(i.renewsAt as string);
    return [level, d < 0 ? dt("مرّ الموعد منذ {0} يوم", [-d]) : d === 0 ? dt("اليوم") : dt("خلال {0} يوم", [d])] as const;
  };
  const field = (k: keyof Draft, label: string, type = "text", extra: Record<string, string> = {}) => (
    <label className="grid gap-1 text-xs font-semibold">{label}
      <input type={type} className="rounded border p-2 text-sm font-normal" value={draft ? String(draft[k]) : ""} onChange={(e) => draft && setDraft({ ...draft, [k]: e.target.value })} {...extra} />
    </label>);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{dt("تجديدات الخدمات")}</h1>
          <p className="mt-1 text-sm text-slate-600">{dt("الخدمات المدفوعة التي يعتمد عليها الموقع. يظهر تنبيه في أعلى لوحة التحكم قبل التجديد بـ 14 يوماً، ويختفي عند الضغط على «تم التجديد بنجاح».")}</p>
        </div>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">{dt("إضافة خدمة")}</button>
      </header>

      {draft && (
        <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
          {field("name", dt("اسم الخدمة"))}{field("provider", dt("المزوّد"))}
          {field("renewsAt", dt("تاريخ التجديد القادم"), "date")}
          <label className="grid gap-1 text-xs font-semibold">{dt("دورة الدفع")}
            <select className="rounded border p-2 text-sm font-normal" value={draft.cycle} onChange={(e) => setDraft({ ...draft, cycle: e.target.value as RenewalCycle })}>
              {(["MONTHLY", "YEARLY", "ONCE"] as const).map((c) => <option key={c} value={c}>{cycleLabel(c)}</option>)}
            </select></label>
          {field("amount", dt("المبلغ"), "number", { min: "0", step: "0.01" })}{field("currency", dt("العملة"), "text", { maxLength: "3", dir: "ltr" })}
          {field("cardLast4", dt("آخر 4 أرقام من البطاقة"), "text", { maxLength: "4", inputMode: "numeric", dir: "ltr", placeholder: "4521" })}{field("owner", dt("المسؤول"))}
          {field("billingUrl", dt("رابط صفحة الدفع"), "url", { dir: "ltr", placeholder: "https://" })}{field("notes", dt("ملاحظات"))}
          <p className="text-xs text-slate-500 sm:col-span-2">{dt("لا تُدخل رقم البطاقة كاملاً: آخر 4 أرقام فقط للتعرّف عليها.")}</p>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void save()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{dt("حفظ")}</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-sm">{dt("إلغاء")}</button>
          </div>
        </section>)}

      <ul className="space-y-2">{items.map((i) => {
        const [level, label] = status(i);
        return (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
            <div className="min-w-0">
              <p className="font-bold">{i.name} <span className="text-sm font-normal text-slate-500">· {i.provider}</span></p>
              <p className="text-xs text-slate-600">
                {i.renewsAt ? <span dir="ltr">{i.renewsAt}</span> : "—"} · {cycleLabel(i.cycle)}
                {i.amount != null ? <> · <span dir="ltr">{i.amount} {i.currency}</span></> : null}
                {i.cardLast4 ? <> · {dt("بطاقة …{0}", [i.cardLast4])}</> : null}
                {i.owner ? <> · {i.owner}</> : null}
                {i.lastConfirmedAt ? <> · {dt("آخر تجديد مؤكد: {0}", [i.lastConfirmedAt.slice(0, 10)])}</> : null}
              </p>
              {i.notes ? <p className="text-xs text-slate-500">{i.notes}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${BADGE[level]}`}>{label}</span>
              {i.billingUrl ? <a href={i.billingUrl} target="_blank" rel="noreferrer" className="rounded border px-2 py-1 text-xs">{dt("صفحة الدفع")}</a> : null}
              {!i.auto && i.renewsAt && level !== "NONE" ? <button type="button" disabled={busy} onClick={() => { if (window.confirm(dt("تأكيد أن «{0}» تجدد بنجاح؟ سيختفي التنبيه وينتقل الموعد للدورة التالية.", [i.name]))) void call("PATCH", { id: i.id, confirm: true }).then((ok) => ok && setNotice(dt("تم تسجيل التجديد"))); }} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white">{dt("تم التجديد بنجاح")}</button> : null}
              {!i.auto ? <button type="button" onClick={() => edit(i)} className="rounded border px-2 py-1 text-xs">{dt("تعديل")}</button> : null}
              {!i.auto ? <button type="button" disabled={busy} onClick={() => { if (window.confirm(dt("حذف «{0}» من القائمة؟", [i.name]))) void call("DELETE", undefined, `?id=${i.id}`); }} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">{dt("حذف")}</button> : <span className="text-xs text-slate-500">{dt("تلقائي")}</span>}
            </div>
          </li>);
      })}</ul>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
    </div>
  );
}
