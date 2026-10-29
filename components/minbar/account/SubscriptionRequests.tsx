"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { subscriptionRequestCopy, subscriptionRequestKinds, subscriptionRequestKindIndex } from "@/lib/donations/subscription-request-copy";
import { receiptMoney } from "@/lib/templates/receipt-localization";

type RequestRow = { id: string; kind: string; status: string; createdAt: string; requestedAmount: number | null; currency: string };
export default function SubscriptionRequests({ subscriptionId }: { subscriptionId: string }) {
  const locale = useLocale(), copy = subscriptionRequestCopy(locale);
  const [kind, setKind] = useState<string>("AMOUNT_CHANGE"), [amount, setAmount] = useState(""), [note, setNote] = useState("");
  const [rows, setRows] = useState<RequestRow[]>([]), [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState(false), [received, setReceived] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(false); setReceived(false); setRows([]);
    void fetch(`/api/users/me/subscriptions/${subscriptionId}/requests`, { signal: abort.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!abort.signal.aborted) { setRows(data.requests); setCurrency(data.plan.currency); setAmount(String(data.plan.amount)); }
    }).catch(() => { if (!abort.signal.aborted) setError(true); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [subscriptionId]);
  const submit = async () => {
    setSending(true); setError(false); setReceived(false);
    try {
      const response = await fetch(`/api/users/me/subscriptions/${subscriptionId}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, amount: Number(amount), note, locale }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setRows(previous => [data.request, ...previous.filter(row => row.id !== data.request.id)]); setReceived(true); setNote("");
    } catch { setError(true); } finally { setSending(false); }
  };
  return <div className="grid min-w-0 gap-3">
    <p className="text-sm leading-7 text-slate-600">{copy[11]}</p>
    <label className="grid gap-1 text-sm">{copy[0]}<select value={kind} onChange={event => setKind(event.target.value)} disabled={loading || sending} className="min-h-11 rounded-lg border bg-white p-2">
      {subscriptionRequestKinds.map((value, i) => <option key={value} value={value}>{copy[i + 1]}</option>)}
    </select></label>
    {kind === "AMOUNT_CHANGE" && <label className="grid gap-1 text-sm">{copy[4]} <bdi>{currency}</bdi><input type="number" min="0.001" step="any" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={loading || sending} className="min-h-11 rounded-lg border p-2" /></label>}
    <label className="grid gap-1 text-sm">{copy[5]}<textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} disabled={loading || sending} className="min-h-20 rounded-lg border p-2" /></label>
    <button type="button" disabled={loading || sending || kind === "AMOUNT_CHANGE" && !(Number(amount) > 0)} aria-busy={sending} onClick={() => void submit()} className="min-h-11 rounded-lg bg-[#a93428] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{copy[6]}</button>
    {received && <p role="status" className="text-sm text-emerald-700">{copy[7]}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{copy[12]}</p>}
    {rows.length > 0 && <ul className="m-0 grid list-none gap-2 p-0">{rows.map(row => <li key={row.id} className="rounded-lg border p-3 text-sm leading-7">
      <b>{copy[subscriptionRequestKindIndex(row.kind)]}</b> · {row.status === "COMPLETED" ? copy[10] : row.status === "IN_PROGRESS" ? copy[9] : copy[8]}
      {row.requestedAmount !== null && <span className="block">{receiptMoney(row.requestedAmount, row.currency, locale)}</span>}
      <time dateTime={row.createdAt} className="block text-xs text-slate-500">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.createdAt))}</time>
    </li>)}</ul>}
  </div>;
}
