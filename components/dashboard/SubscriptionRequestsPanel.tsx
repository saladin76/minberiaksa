"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dt, dashIntl } from "@/lib/dashboard/i18n";
import { useViewUserProfile } from "@/context/ViewUserProfileContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { focusSubscriptionTarget, subscriptionManagementHref, type SubscriptionRequestRow as Row } from "@/lib/donations/subscription-navigation";
import { OPEN_REQUEST_STATUSES, requestHistory } from "@/lib/donations/subscription-request-policy";

const statusLabel = (status: string) => status === "COMPLETED" ? dt("منفّذ") : status === "REJECTED" ? dt("تعذّر تنفيذ الطلب") : status === "WITHDRAWN" ? dt("مسحوب من المتبرع") : status === "IN_PROGRESS" ? dt("قيد التنفيذ") : dt("جديد");
const kindLabel = (kind: string) => kind === "AMOUNT_CHANGE" ? dt("طلب تغيير المبلغ") : kind === "PAUSE" ? dt("طلب الإيقاف مؤقتاً") : dt("طلب الإلغاء");
const date = (value: string) => new Intl.DateTimeFormat(dashIntl("ar-EG"), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value));
const btn = "min-h-11 rounded-lg border px-3 text-xs disabled:opacity-50";

export function SubscriptionRequestsPanel({ donorId, selectedRequest, onChanged, refreshKey = 0, selectedRequestId, selectedSubscriptionId }: { selectedRequestId?: string; selectedSubscriptionId?: string; refreshKey?: number; donorId?: string; selectedRequest?: Row | null; onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]), [openCount, setOpenCount] = useState(0), [status, setStatus] = useState("OPEN"), [kind, setKind] = useState("");
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [pinned, setPinned] = useState<Row | null>(selectedRequest ?? null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const { openUserProfile } = useViewUserProfile();
  const generation = useRef(0);
  const selectedCanComplete = selectedRequest?.canComplete;
  const pinnedId = selectedRequest?.id ?? selectedRequestId, pinnedDonor = selectedRequest?.donorId ?? donorId, pinnedSubscription = selectedRequest?.subscriptionId ?? selectedSubscriptionId;
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status, page: String(page) });
      if (kind) params.set("kind", kind);
      if (donorId && donorId !== "all") params.set("userId", donorId);
      const exact = pinnedId && pinnedDonor && pinnedSubscription && (!donorId || donorId === "all" || donorId === pinnedDonor) ? new URLSearchParams({ requestId: pinnedId, userId: pinnedDonor!, subscriptionId: pinnedSubscription! }) : null;
      const [data, selected] = await Promise.all([params, exact].map(async query => {
        if (!query) return null;
        const response = await fetch(`/api/admin/subscription-requests?${query}`, { cache: "no-store", signal });
        if (!response.ok) throw new Error();
        return response.json();
      }));
      if (current === generation.current && !signal?.aborted) {
        setRows(data.requests); setOpenCount(data.openCount); setPages(data.pagination?.pages ?? 1); if (data.pagination?.pages && page > data.pagination.pages) setPage(data.pagination.pages); setTotal(data.pagination?.total ?? data.requests.length);
        setPinned(selected?.requests?.find((row: Row) => row.id === pinnedId) ?? null);
      }
    } catch { if (current === generation.current && !signal?.aborted) setError(dt("تعذّر تحميل طلبات إدارة التبرع.")); }
    finally { if (current === generation.current && !signal?.aborted) setLoading(false); }
  }, [status, kind, page, donorId, pinnedId, pinnedDonor, pinnedSubscription]);
  useEffect(() => { setRows([]); setPinned(null); }, [status, kind, page, donorId, pinnedId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, selectedCanComplete, refreshKey]);
  useEffect(() => { setPage(1); }, [donorId]);
  const listedRows = rows.filter(row => row.id !== pinned?.id);
  const card = (row: Row) => <RequestCard key={row.id} initiallyOpen={row.id === pinned?.id} row={row} disabled={loading} refresh={load} onChanged={onChanged} openProfile={() => void openUserProfile(row.donorId)} />;
  return <Card id="subscription-requests" className="overflow-hidden border-slate-200 shadow-sm">
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{dt("طلبات إدارة التبرع")} <bdi>({openCount})</bdi></CardTitle>
      <div className="flex flex-wrap gap-2"><select aria-label={dt("حالة الطلب")} value={status} onChange={event => { setPage(1); setStatus(event.target.value); }} className="min-h-11 max-w-full rounded-lg border p-2 text-xs">
        <option value="OPEN">{dt("طلبات مفتوحة")}</option>{["NEW", "IN_PROGRESS", "COMPLETED", "REJECTED", "WITHDRAWN"].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </select><select aria-label={dt("نوع الطلب")} value={kind} onChange={event => { setPage(1); setKind(event.target.value); }} className="min-h-11 max-w-full rounded-lg border p-2 text-xs"><option value="">{dt("كل أنواع الطلبات")}</option>{["AMOUNT_CHANGE", "PAUSE", "CANCEL"].map(value => <option key={value} value={value}>{kindLabel(value)}</option>)}</select>
      <button type="button" onClick={() => void load()} disabled={loading} className={btn}>{dt("تحديث")}</button></div>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-3">
      <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-800">{dt("طلبات مفتوحة")}</p><strong className="mt-1 block text-2xl text-slate-900">{openCount}</strong></div><div className="rounded-xl border bg-slate-50 p-4"><p className="text-xs text-slate-500">{dt("إجمالي النتائج")}</p><strong className="mt-1 block text-2xl text-slate-900">{total}</strong></div></div>
      <p className="text-xs leading-6 text-slate-500">{dt("راجع الطلب ونفّذ التغيير من إدارة الاشتراك، ثم أكّد إنجازه. تحديث حالة الطلب وحده لا يغيّر الخصومات.")}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {pinned && <div className="grid min-w-0 gap-2"><p className="text-xs font-semibold text-brand">{dt("الطلب المحدد")}</p>{card(pinned)}</div>}
      {loading && <p role="status">{dt("جارٍ التحميل…")}</p>}
      {!loading && listedRows.length === 0 && !pinned && !error && <p className="text-sm text-slate-500">{dt("لا توجد طلبات في هذه القائمة.")}</p>}
      {listedRows.map(card)}
      <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={dt("صفحات طلبات التبرع")}><span className="text-xs">{dt("إجمالي النتائج")}: <bdi>{total}</bdi> · <bdi>{page} / {pages}</bdi></span><div className="flex gap-2"><button type="button" className={btn} disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{dt("السابق")}</button><button type="button" className={btn} disabled={loading || page >= pages} onClick={() => setPage(value => value + 1)}>{dt("التالي")}</button></div></nav>
    </CardContent>
  </Card>;
}
function RequestCard({ row, disabled, refresh, openProfile, onChanged, initiallyOpen }: { initiallyOpen?: boolean; row: Row; disabled: boolean; refresh: () => Promise<void>; openProfile: () => void; onChanged?: () => void }) {
  const [note, setNote] = useState(row.staffNote ?? ""), [reply, setReply] = useState(row.resolutionNote ?? ""), [revision, setRevision] = useState(row.updatedAt);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const locked = useRef(false);
  const stale = revision !== row.updatedAt;
  const update = async (status: string) => {
    if (locked.current || disabled || stale) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/subscription-requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, status, staffNote: note, resolutionNote: reply, updatedAt: revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || dt("تعذّر تحديث الطلب."));
      if (data.updatedAt) setRevision(data.updatedAt);
      window.dispatchEvent(new Event("subscription-requests-updated"));
      await refresh(); onChanged?.();
    } catch (err) { setError(err instanceof Error ? err.message : dt("تعذّر تحديث الطلب.")); }
    finally { locked.current = false; setBusy(false); }
  };
  const focusCurrentTarget = () => {
    const current = new URL(window.location.href);
    if (current.pathname === "/dashboard/monthly" && current.searchParams.get("userId") === row.donorId &&
        current.searchParams.get("subscriptionId") === row.subscriptionId && current.searchParams.get("requestId") === row.id) requestAnimationFrame(() => focusSubscriptionTarget(row.subscriptionId));
  };
  const open = OPEN_REQUEST_STATUSES.includes(row.status), timeline = requestHistory(row.history);
  return <article id={`subscription-request-${row.id}`} tabIndex={-1} className="grid min-w-0 scroll-mt-28 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="min-h-11 text-sm font-bold underline" onClick={openProfile}>{row.donorName || dt("متبرع")}</button><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{statusLabel(row.status)}</span></div>
    <b className="text-sm">{kindLabel(row.kind)} {row.requestedAmount !== null && <bdi>{row.requestedAmount} {row.currency}</bdi>}</b>
    <details className="rounded-lg bg-slate-50 px-3"><summary className="min-h-11 cursor-pointer content-center text-xs text-slate-600">{dt("تفاصيل الطلب")}</summary><dl className="grid min-w-0 gap-2 pb-3 text-xs sm:grid-cols-2"><div><dt>{dt("رقم الطلب")}</dt><dd className="break-all"><bdi>{row.id}</bdi></dd></div><div><dt>{dt("رقم الاشتراك")}</dt><dd className="break-all"><bdi>{row.subscriptionId}</bdi></dd></div>{row.plan && <><div><dt>{dt("المبلغ الحالي")}</dt><dd><bdi>{row.plan.amount} {row.plan.currency}</bdi></dd></div><div><dt>{dt("حالة الاشتراك")}</dt><dd>{row.plan.status}</dd></div></>}</dl></details>
    <p className="whitespace-pre-wrap break-words text-sm">{row.note}</p>
    <time dateTime={row.createdAt} className="text-xs text-slate-500">{date(row.createdAt)}</time>
    <Link className="min-h-11 content-center text-xs underline" onClick={focusCurrentTarget} href={subscriptionManagementHref(row.donorId, row.subscriptionId, row.id)}>{dt("فتح اشتراكات المتبرع")}</Link>
    {timeline.length > 0 && <details><summary className="min-h-11 content-center text-xs">{dt("سجل المتابعة")}</summary><ol className="grid gap-2 border-s ps-4 text-xs">{timeline.map((event, index) => <li key={index}>{statusLabel(event.status)} · <time dateTime={event.at}>{date(event.at)}</time>{event.reply && <p className="whitespace-pre-wrap break-words">{event.reply}</p>}</li>)}</ol></details>}
    {!open && <>{row.staffNote && <p className="whitespace-pre-wrap break-words text-xs text-slate-600"><b>{dt("ملاحظة داخلية للفريق")}: </b>{row.staffNote}</p>}{row.resolutionNote && <p className="whitespace-pre-wrap break-words text-xs"><b>{dt("رد يظهر للمتبرع")}: </b>{row.resolutionNote}</p>}</>}
    {open && <details open={initiallyOpen || undefined} className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-brand">{dt("متابعة الطلب")}</summary><div className="grid gap-3 pt-3">
      {stale && <div role="alert" className="text-xs text-amber-800"><p>{dt("تغير الطلب منذ فتحه. راجع النسخة الجديدة قبل الحفظ.")}</p><button type="button" className={btn} onClick={() => { setNote(row.staffNote ?? ""); setReply(row.resolutionNote ?? ""); setRevision(row.updatedAt); setError(""); }}>{dt("تحميل النسخة الجديدة")}</button></div>}
      <label className="grid gap-1 text-xs">{dt("ملاحظة داخلية للفريق")}<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} className="min-h-16 rounded-lg border p-2 text-base" disabled={busy || disabled} /></label>
      <label className="grid gap-1 text-xs">{dt("رد يظهر للمتبرع")}<textarea maxLength={2000} value={reply} onChange={event => setReply(event.target.value)} className="min-h-16 rounded-lg border p-2 text-base" disabled={busy || disabled} /></label>
      {row.canComplete === false && <p className="text-xs text-amber-800">{dt("التغيير المطلوب غير مثبت على الاشتراك بعد. افتح الاشتراك ونفّذه ثم حدّث الطلب.")}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || busy || stale || !revision || note.trim().length < 3} onClick={() => void update("IN_PROGRESS")} className={btn}>{dt("قيد التنفيذ")}</button><button type="button" disabled={disabled || busy || stale || !revision || note.trim().length < 3 || row.canComplete === false} onClick={() => void update("COMPLETED")} className={btn + " bg-emerald-700 text-white"}>{dt("تأكيد إنجاز الطلب")}</button><button type="button" disabled={disabled || busy || stale || !revision || note.trim().length < 3 || reply.trim().length < 3} onClick={() => void update("REJECTED")} className={btn}>{dt("إغلاق مع توضيح تعذّر التنفيذ")}</button></div>
    </div></details>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </article>;
}
