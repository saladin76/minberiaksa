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
  const orderedCards = [...cards].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const field = "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base disabled:opacity-60";
  return <section dir={["ar", "ur"].includes(locale) ? "rtl" : "ltr"} className="min-w-0 space-y-5" data-private="" data-clarity-mask="True" data-hj-suppress="">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><CreditCard size={18} />{cp("cardsTitle")}<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs tabular-nums">{loading ? "…" : cards.length}</span></div>
      <button type="button" disabled={busy || loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{cp("refresh")}</button>
    </header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    {loading ? <div role="status" aria-label={cp("cardsTitle")} className="grid gap-4 sm:grid-cols-2">{[0, 1].map(key => <div key={key} className="h-56 animate-pulse rounded-2xl bg-slate-100" />)}</div> : <>
      {!cards.length && !error ? <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500"><CreditCard size={32} /><p className="text-sm">{cp("emptyCards")}</p></div> : null}
      <div className="grid min-w-0 items-start gap-5 sm:grid-cols-2">{orderedCards.map(card => <article key={card.id} className={`min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${card.isDefault ? "border-[#A5243D]/35 ring-1 ring-[#A5243D]/10" : "border-slate-200"}`}>
        <div className={`relative flex min-h-48 flex-col justify-between gap-7 overflow-hidden p-5 text-white ${card.isDefault ? "bg-gradient-to-br from-[#8C2035] via-[#A5243D] to-[#C24A60]" : "bg-gradient-to-br from-[#162F3B] to-[#34525D]"}`}>
          <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <span dir="ltr" className="text-sm font-bold uppercase tracking-wider">{card.cardType}</span>
            {card.isDefault ? <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25"><Star size={12} fill="currentColor" />{cp("defaultCard")}</span> : <CreditCard size={21} className="text-white/70" />}
          </div>
          <div className="relative space-y-4">
            <p dir="ltr" className="font-mono text-lg tracking-[0.08em] lg:text-xl">•••• •••• •••• {card.last4}</p>
            <div className="flex flex-wrap items-end justify-between gap-3 text-sm">
              <span className="max-w-[60%] truncate font-medium text-white/90">{card.nickname && card.nickname.toLowerCase() !== "recurring" ? card.nickname : card.cardType.toUpperCase()}</span>
              <span className="text-end"><span className="block text-[10px] text-white/65">{t("cardExpiry")}</span><span dir="ltr" className="inline-block font-mono tracking-wider">{card.expiryDate}</span></span>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {!card.isDefault ? <button type="button" disabled={busy || loading} onClick={() => void mutate(`/api/credit-cards/${card.id}`, "PATCH", { isDefault: true })} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#A5243D]/25 bg-[#A5243D]/5 px-3 text-sm font-semibold text-[#A5243D] transition hover:bg-[#A5243D]/10 disabled:opacity-50"><Star size={15} />{cp("makeDefault")}</button> : null}
          <details className="rounded-xl border border-slate-200 px-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-slate-600">{cp("nickname")}</summary>
            <form className="space-y-3 pb-3" onSubmit={event => { event.preventDefault(); void mutate(`/api/credit-cards/${card.id}`, "PATCH", { nickname: card.nickname || "" }); }}>
              <label className="block space-y-1"><span className="text-xs text-slate-500">{cp("nickname")}</span><input className={field} maxLength={80} value={card.nickname || ""} disabled={busy || loading} onChange={event => setCards(previous => previous.map(row => row.id === card.id ? { ...row, nickname: event.target.value } : row))} /></label>
              <button type="submit" disabled={busy || loading} className="min-h-11 rounded-lg bg-[#A5243D] px-4 text-sm font-semibold text-white disabled:opacity-50">{cp("save")}</button>
            </form>
          </details>
          <details className="px-1"><summary className="min-h-11 cursor-pointer py-3 text-xs text-red-700">{t("remove")}</summary><p className="mb-3 text-xs leading-6 text-slate-600">{cp("removeWarning")}</p><button type="button" disabled={busy || loading} onClick={() => void mutate(`/api/credit-cards/${card.id}`, "DELETE")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm text-red-700 disabled:opacity-50"><Trash2 size={15} />{cp("confirmRemove")}</button></details>
        </div>
      </article>)}</div>
    </>}
    <aside className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
      <p className="text-sm leading-7 text-slate-600">{cp("cardsDescription")}</p>
      <Link href={`/${locale}/profile?tab=subscriptions`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#A5243D]">{cp("manageSubscriptions")}<span aria-hidden="true">↗</span></Link>
    </aside>
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
