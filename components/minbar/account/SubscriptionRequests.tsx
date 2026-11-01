"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { subscriptionRequestCopy, subscriptionRequestKinds, subscriptionRequestKindIndex, subscriptionRequestFollowUp, subscriptionRequestStatusLabel } from "@/lib/donations/subscription-request-copy";
import { OPEN_REQUEST_STATUSES, requestHistory, validReduction, type RequestEvent } from "@/lib/donations/subscription-request-policy";
import { receiptMoney } from "@/lib/templates/receipt-localization";

type RequestRow = { id: string; kind: string; status: string; createdAt: string; updatedAt: string; requestedAmount: number | null; currency: string; note: string; resolutionNote?: string; history?: RequestEvent[] };
export default function SubscriptionRequests({ subscriptionId }: { subscriptionId: string }) {
  const locale = useLocale(), copy = subscriptionRequestCopy(locale), follow = subscriptionRequestFollowUp(locale);
  const [kind, setKind] = useState<string>("AMOUNT_CHANGE"), [amount, setAmount] = useState(""), [note, setNote] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]), [plan, setPlan] = useState<{ amount: number; currency: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState(false), [received, setReceived] = useState(false), [duplicate, setDuplicate] = useState(false);
  const target = useRef(subscriptionId), sequence = useRef(0), busy = useRef(false);
  target.current = subscriptionId;
  const load = useCallback(async (signal?: AbortSignal) => {
    const generation = ++sequence.current;
    setLoading(true); setError(false);
    try {
      const response = await fetch(`/api/users/me/subscriptions/${subscriptionId}/requests`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!signal?.aborted && generation === sequence.current && target.current === subscriptionId) { setRows(data.requests); setPlan(data.plan); setAmount(String(data.plan.amount)); }
    } catch { if (!signal?.aborted && generation === sequence.current) setError(true); }
    finally { if (!signal?.aborted && generation === sequence.current) setLoading(false); }
  }, [subscriptionId]);
  useEffect(() => {
    const abort = new AbortController();
    setRows([]); setPlan(null); setReceived(false); setDuplicate(false); setNote("");
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  const open = rows.find(row => row.kind === kind && OPEN_REQUEST_STATUSES.includes(row.status));
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(value));
  const mutate = async (row?: RequestRow) => {
    if (busy.current || !plan || !row && (open || kind === "AMOUNT_CHANGE" && !validReduction(Number(amount), plan.amount))) return;
    if (row && !window.confirm(follow[2] + "؟")) return;
    busy.current = true; setSending(true); setError(false); setReceived(false); setDuplicate(false);
    try {
      const response = await fetch(`/api/users/me/subscriptions/${subscriptionId}/requests`, { method: row ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row ? { requestId: row.id, updatedAt: row.updatedAt } : { kind, amount: Number(amount), note, locale }) });
      const data = await response.json();
      if (target.current !== subscriptionId) return;
      if (data.request) setRows(previous => [data.request, ...previous.filter(item => item.id !== data.request.id)]);
      if (!response.ok) {
        if (data.error === "REQUEST_ALREADY_OPEN") { setDuplicate(true); return; }
        throw new Error();
      }
      if (!row) { setReceived(true); setNote(""); setDuplicate(!!data.alreadyReceived); }
    } catch { if (target.current === subscriptionId) setError(true); }
    finally { busy.current = false; if (target.current === subscriptionId) setSending(false); }
  };
  return <div className="grid min-w-0 gap-3">
    <p id={`subscription-request-notice-${subscriptionId}`} className="text-sm leading-7 text-slate-600">{copy[11]}</p>
    {plan && <p className="text-sm">{follow[10]}: <bdi>{receiptMoney(plan.amount, plan.currency, locale)}</bdi></p>}
    <button type="button" disabled={loading || sending} onClick={() => void load()} className="min-h-11 justify-self-start rounded-lg border px-4 text-sm">{follow[8]}</button>
    {plan && plan.status !== "CANCELLED" && <>
      <label className="grid gap-1 text-sm">{copy[0]}<select value={kind} onChange={event => { setKind(event.target.value); setReceived(false); setDuplicate(false); }} disabled={loading || sending} className="min-h-11 rounded-lg border bg-white p-2">
        {subscriptionRequestKinds.map((value, i) => <option key={value} value={value}>{copy[i + 1]}</option>)}
      </select></label>
      {open ? <p role="status" className="text-sm leading-7 text-amber-800">{follow[5]}</p> : <>
        {kind === "AMOUNT_CHANGE" && <label className="grid gap-1 text-sm">{copy[4]} <bdi>{plan.currency}</bdi><input type="number" min="1" max={plan.amount} step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={loading || sending} className="min-h-11 rounded-lg border p-2" /><span className="text-xs leading-6 text-slate-600">{follow[6]}</span></label>}
        <label className="grid gap-1 text-sm">{copy[5]}<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} disabled={loading || sending} className="min-h-20 rounded-lg border p-2" /></label>
        <button type="button" disabled={loading || sending || error || kind === "AMOUNT_CHANGE" && !validReduction(Number(amount), plan.amount)} aria-busy={sending} onClick={() => void mutate()} className="min-h-11 rounded-lg bg-[#a93428] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{copy[6]}</button>
      </>}
    </>}
    {received && <p role="status" className="text-sm text-emerald-700">{copy[7]}</p>}
    {duplicate && !open && <p role="status" className="text-sm text-amber-800">{follow[5]}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{copy[12]}</p>}
    <h4 className="text-sm font-bold">{follow[0]}</h4>
    {loading ? <p role="status" aria-busy="true">…</p> : !rows.length && !error ? <p className="text-sm text-slate-600">{follow[7]}</p> : null}
    <ul className="m-0 grid list-none gap-3 p-0">{rows.map(row => <li key={row.id} className="grid min-w-0 gap-2 rounded-lg border p-3 text-sm leading-7">
      <div className="flex flex-wrap justify-between gap-2"><b>{copy[subscriptionRequestKindIndex(row.kind)]}</b><span>{subscriptionRequestStatusLabel(row.status, locale)}</span></div>
      <span className="break-all text-xs text-slate-600">{follow[9]}: <bdi>{row.id}</bdi></span>
      {row.requestedAmount !== null && <span><bdi>{receiptMoney(row.requestedAmount, row.currency, locale)}</bdi></span>}
      {row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
      <time dateTime={row.createdAt} className="text-xs text-slate-600">{date(row.createdAt)}</time>
      {row.resolutionNote && <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2"><b>{follow[1]}: </b>{row.resolutionNote}</p>}
      {requestHistory(row.history).length > 0 && <details><summary className="min-h-11 cursor-pointer">{follow[0]}</summary><ol className="grid gap-2 border-s ps-5">{requestHistory(row.history).map((event, index) => <li key={index}><b>{subscriptionRequestStatusLabel(event.status, locale)}</b> · <time dateTime={event.at}>{date(event.at)}</time>{event.reply && <p className="whitespace-pre-wrap break-words">{event.reply}</p>}</li>)}</ol></details>}
      {OPEN_REQUEST_STATUSES.includes(row.status) && <button type="button" disabled={sending || loading} onClick={() => void mutate(row)} className="min-h-11 justify-self-start rounded-lg border px-4 text-sm">{follow[2]}</button>}
    </li>)}</ul>
  </div>;
}
