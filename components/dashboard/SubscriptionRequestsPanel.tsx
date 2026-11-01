"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dt, dashIntl } from "@/lib/dashboard/i18n";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { focusSubscriptionTarget, subscriptionManagementHref, type SubscriptionRequestRow as Row } from "@/lib/donations/subscription-navigation";

export function SubscriptionRequestsPanel({ donorId, selectedRequest, onChanged }: { donorId?: string; selectedRequest?: Row | null; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [openCount, setOpenCount] = useState(0), [status, setStatus] = useState("OPEN");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const { openUserProfile } = useViewUserProfile();
  const generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status });
      if (donorId && donorId !== "all") params.set("userId", donorId);
      const response = await fetch(`/api/admin/subscription-requests?${params}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (current === generation.current && !signal?.aborted) { setRows(data.requests); setOpenCount(data.openCount); }
    }
    catch { if (current === generation.current && !signal?.aborted) { setRows([]); setOpenCount(0); setError(dt("تعذّر تحميل طلبات إدارة التبرع.")); } }
    finally { if (current === generation.current && !signal?.aborted) setLoading(false); }
  }, [status, donorId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const pinned = selectedRequest && (!donorId || donorId === selectedRequest.donorId) ? selectedRequest : null;
  const listedRows = rows.filter(row => row.id !== pinned?.id);
  return <Card id="subscription-requests">
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{dt("طلبات إدارة التبرع")} <bdi>({openCount})</bdi></CardTitle>
      <div className="flex gap-2"><select aria-label={dt("حالة الطلب")} value={status} onChange={event => setStatus(event.target.value)} className="min-h-10 rounded-lg border p-2 text-xs"><option value="OPEN">{dt("طلبات مفتوحة")}</option><option value="COMPLETED">{dt("منفّذة")}</option></select><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border px-3 text-xs">{dt("تحديث")}</button></div>
    </CardHeader>
    <CardContent className="grid gap-3">
      <p className="text-xs leading-6 text-slate-500">{dt("راجع الطلب ونفّذ التغيير من إدارة الاشتراك، ثم أكّد إنجازه. تحديث حالة الطلب وحده لا يغيّر الخصومات.")}</p>
      {pinned && <div className="grid gap-2"><p className="text-xs font-semibold text-brand">{dt("الطلب المحدد")}</p><RequestCard key={pinned.id} row={pinned} refresh={load} onChanged={onChanged} openProfile={() => void openUserProfile(pinned.donorId)} /></div>}
      {loading ? <p role="status">{dt("جارٍ التحميل…")}</p> : listedRows.length === 0 && !pinned ? <p className="text-sm text-slate-500">{dt("لا توجد طلبات في هذه القائمة.")}</p> : listedRows.map(row => <RequestCard key={row.id} row={row} refresh={load} onChanged={onChanged} openProfile={() => void openUserProfile(row.donorId)} />)}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </CardContent>
  </Card>;
}
function RequestCard({ row, refresh, openProfile, onChanged }: { row: Row; refresh: () => Promise<void>; openProfile: () => void; onChanged?: () => void }) {
  const [note, setNote] = useState(row.staffNote ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const update = async (status: string) => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/subscription-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, status, staffNote: note }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || dt("تعذّر تحديث الطلب.")); await refresh(); onChanged?.(); }
    catch (err) { setError(err instanceof Error ? err.message : dt("تعذّر تحديث الطلب.")); } finally { setBusy(false); }
  };
  const kind = row.kind === "AMOUNT_CHANGE" ? dt("طلب تغيير المبلغ") : row.kind === "PAUSE" ? dt("طلب الإيقاف مؤقتاً") : dt("طلب الإلغاء");
  const focusCurrentTarget = () => {
    const current = new URL(window.location.href);
    if (current.pathname === "/dashboard/monthly" && current.searchParams.get("userId") === row.donorId &&
        current.searchParams.get("subscriptionId") === row.subscriptionId && current.searchParams.get("requestId") === row.id) {
      requestAnimationFrame(() => focusSubscriptionTarget(row.subscriptionId));
    }
  };
  return <article id={`subscription-request-${row.id}`} tabIndex={-1} className="grid min-w-0 scroll-mt-28 gap-2 rounded-xl border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="text-sm font-bold underline" onClick={openProfile}>{row.donorName || dt("متبرع")}</button><span className="text-xs">{row.status === "COMPLETED" ? dt("منفّذ") : row.status === "IN_PROGRESS" ? dt("قيد التنفيذ") : dt("جديد")}</span></div>
    <b className="text-sm">{kind} {row.requestedAmount !== null && <bdi>{row.requestedAmount} {row.currency}</bdi>}</b>
    <p className="whitespace-pre-wrap break-words text-sm">{row.note}</p>
    <time className="text-xs text-slate-500">{new Intl.DateTimeFormat(dashIntl("ar-EG"), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(row.createdAt))}</time>
    <Link className="text-xs underline" onClick={focusCurrentTarget} href={subscriptionManagementHref(row.donorId, row.subscriptionId, row.id)}>{dt("فتح اشتراكات المتبرع")}</Link>
    {row.status === "COMPLETED" && row.staffNote && <p className="whitespace-pre-wrap break-words text-xs text-slate-600"><b>{dt("ملاحظة المتابعة")}: </b>{row.staffNote}</p>}
    {row.status !== "COMPLETED" && <><label className="grid gap-1 text-xs">{dt("ملاحظة المتابعة")}<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} className="min-h-16 rounded-lg border p-2" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || note.trim().length < 3} onClick={() => void update("IN_PROGRESS")} className="min-h-10 rounded-lg border px-3 text-xs disabled:opacity-50">{dt("قيد التنفيذ")}</button><button type="button" disabled={busy || note.trim().length < 3} onClick={() => void update("COMPLETED")} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs text-white disabled:opacity-50">{dt("تأكيد إنجاز الطلب")}</button></div></>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </article>;
}
