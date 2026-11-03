"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CreditCard, Plus, RefreshCw, Star, Trash2 } from "lucide-react";

type Card = { id: string; last4: string; cardType: string; expiryDate: string; nickname: string | null; isDefault: boolean };
export default function PaymentCards({ locale }: { locale: string }) {
  const cp = useTranslations("ProfileCardUpdate"), t = useTranslations("cart");
  const [cards, setCards] = useState<Card[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [number, setNumber] = useState(""), [expiry, setExpiry] = useState(""), [holder, setHolder] = useState(""), [cvc, setCvc] = useState("");
  const locked = useRef(false), generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current; setLoading(true); setError("");
    try {
      const response = await fetch("/api/credit-cards", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok || !Array.isArray(data.cards)) throw new Error();
      if (!signal?.aborted && current === generation.current) setCards(data.cards);
    } catch { if (!signal?.aborted && current === generation.current) setError(cp("error")); }
    finally { if (!signal?.aborted && current === generation.current) setLoading(false); }
  }, [cp]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function mutate(url: string, method: string, body?: object) {
    if (locked.current || loading) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000), ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok) { setError(cp(data.error === "CARD_IN_USE" ? "cardInUse" : "error")); return; }
      setNumber(""); setExpiry(""); setHolder(""); setCvc("");
      await load(); setNotice(cp("saved"));
    } catch { setError(cp("error")); }
    finally { setCvc(""); locked.current = false; setBusy(false); }
  }
  const field = "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base disabled:opacity-60";
  return <section dir={["ar", "ur"].includes(locale) ? "rtl" : "ltr"} className="min-w-0 space-y-5" data-private="" data-clarity-mask="True" data-hj-suppress="">
    <header><h2 className="flex items-center gap-2 text-2xl font-bold"><CreditCard size={24} />{cp("cardsTitle")}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{cp("cardsDescription")}</p></header>
    <Link href={`/${locale}/profile?tab=subscriptions`} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold text-[#A5243D]">{cp("manageSubscriptions")}</Link>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    {loading ? <p role="status">…</p> : <>
      {!cards.length && !error ? <p className="rounded-xl border border-dashed p-6 text-sm text-slate-500">{cp("emptyCards")}</p> : null}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">{cards.map(card => <article key={card.id} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><CreditCard className="text-[#A5243D]" /><span dir="ltr" className="font-mono text-lg tracking-widest">•••• {card.last4}</span>{card.isDefault ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800"><Star size={12} />{cp("defaultCard")}</span> : null}</div>
        <p dir="ltr" className="text-sm text-slate-500">{card.cardType} · {card.expiryDate}</p>
        <form className="space-y-2" onSubmit={event => { event.preventDefault(); void mutate(`/api/credit-cards/${card.id}`, "PATCH", { nickname: card.nickname || "" }); }}>
          <label className="block space-y-1"><span className="text-sm">{cp("nickname")}</span><input className={field} maxLength={80} value={card.nickname || ""} disabled={busy} onChange={event => setCards(previous => previous.map(row => row.id === card.id ? { ...row, nickname: event.target.value } : row))} /></label>
          <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="min-h-11 rounded-lg border px-3 text-sm">{cp("save")}</button>{!card.isDefault ? <button type="button" disabled={busy} onClick={() => void mutate(`/api/credit-cards/${card.id}`, "PATCH", { isDefault: true })} className="min-h-11 rounded-lg border px-3 text-sm">{cp("makeDefault")}</button> : null}</div>
        </form>
        <details><summary className="min-h-11 cursor-pointer text-sm text-red-700">{t("remove")}</summary><p className="mb-2 text-xs leading-6 text-slate-600">{cp("removeWarning")}</p><button type="button" disabled={busy} onClick={() => void mutate(`/api/credit-cards/${card.id}`, "DELETE")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm text-red-700"><Trash2 size={15} />{cp("confirmRemove")}</button></details>
      </article>)}</div>
    </>}
    <button type="button" disabled={busy || loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><RefreshCw size={15} />{cp("refresh")}</button>
    <details onToggle={event => { if (!event.currentTarget.open) { setNumber(""); setExpiry(""); setHolder(""); setCvc(""); } }} className="rounded-2xl border bg-white p-4"><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[#A5243D]"><Plus size={18} />{cp("addCard")}</summary>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void mutate("/api/credit-cards", "POST", { cardNumber: number, expiryDate: expiry, cardholderName: holder, cvc }); }}>
        <label className="space-y-1 sm:col-span-2"><span>{t("cardNumber")}</span><input className={field} dir="ltr" inputMode="numeric" autoComplete="cc-number" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0,19))} required minLength={13} disabled={busy || loading} /></label>
        <label className="space-y-1"><span>{t("cardExpiry")}</span><input className={field} dir="ltr" placeholder="MM/YY" autoComplete="cc-exp" value={expiry} onChange={e => { const v=e.target.value.replace(/\D/g, "").slice(0,4);setExpiry(v.length>2?`${v.slice(0,2)}/${v.slice(2)}`:v); }} pattern="[0-9]{2}/[0-9]{2}" required disabled={busy || loading} /></label>
        <label className="space-y-1"><span>CVC</span><input className={field} type="password" dir="ltr" autoComplete="cc-csc" inputMode="numeric" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g, "").slice(0,4))} pattern="[0-9]{3,4}" required disabled={busy || loading} /></label>
        <label className="space-y-1 sm:col-span-2"><span>{t("cardHolder")}</span><input className={field} autoComplete="cc-name" value={holder} onChange={e => setHolder(e.target.value)} maxLength={120} required disabled={busy || loading} /></label>
        <button type="submit" disabled={busy || loading} className="min-h-11 rounded-xl bg-[#A5243D] px-4 text-white sm:col-span-2">{busy ? "…" : cp("save")}</button>
      </form>
    </details>
  </section>;
}
