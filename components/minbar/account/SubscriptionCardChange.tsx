"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SavedCardPicker } from "@/components/minbar/checkout/SavedCardPicker";
import { Button } from "@/components/ui/button";

export function SubscriptionCardChange({ subscriptionId, locale }: { subscriptionId: string; locale: string }) {
  const cp = useTranslations("ProfileCardUpdate"), t = useTranslations("cart");
  const [open, setOpen] = useState(false), [cards, setCards] = useState<Array<{id: string; last4: string; cardType: string; expiryDate: string; isDefault: boolean}>>([]);
  const [selected, setSelected] = useState(""), [number, setNumber] = useState(""), [expiry, setExpiry] = useState(""), [holder, setHolder] = useState(""), [cvc, setCvc] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(false);
    fetch("/api/credit-cards", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), cache: "no-store" }).then(async r => { if (!r.ok) throw new Error(); const data = await r.json(); if (!controller.signal.aborted) setCards(Array.isArray(data.cards) ? data.cards : []); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [open]);
  const clear = () => { setNumber(""); setExpiry(""); setHolder(""); setCvc(""); };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(false);
    try {
      let cardId = selected;
      if (!cardId) {
        const saved = await fetch("/api/credit-cards", { method: "POST", signal: AbortSignal.timeout(15000), headers: {"Content-Type":"application/json"}, body: JSON.stringify({ cardNumber: number.replace(/\D/g,""), expiryDate: expiry, cardholderName: holder, cvc }) });
        const data = await saved.json(); if (!saved.ok || !data.card?.id) throw new Error(); cardId = data.card.id;
      }
      const response = await fetch(`/api/users/me/subscriptions/${encodeURIComponent(subscriptionId)}/card`, { method: "POST", signal: AbortSignal.timeout(20000), headers: {"Content-Type":"application/json"}, body: JSON.stringify({ cardId, cvc, consent: true, locale }) });
      const data = await response.json(); if (!response.ok || data.verificationOnly !== true || typeof data.actionUrl !== "string" || !data.fields || new URL(data.actionUrl).protocol !== "https:") throw new Error();
      const form = document.createElement("form"); form.method = "POST"; form.action = data.actionUrl;
      form.setAttribute("data-clarity-mask", "True"); form.style.display = "none";
      for (const [name, value] of Object.entries(data.fields)) { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.appendChild(input); }
      clear(); document.body.appendChild(form); form.submit();
    } catch { setError(true); setCvc(""); setBusy(false); }
  }
  const inputClass = "w-full min-w-0 rounded-lg border px-3 py-2 text-base";
  return <details open={open} onToggle={event => { const next = event.currentTarget.open; if (!busy) { setOpen(next); if (!next) clear(); } }} className="rounded-xl border p-4">
    <summary onClick={event => { if (busy) event.preventDefault(); }} aria-disabled={busy} className="cursor-pointer font-semibold text-[#A5243D]">{cp("title")}</summary>
    {open ? <form onSubmit={submit} className="mt-4 space-y-4" data-clarity-mask="True" data-hj-suppress="" data-private="">
      <p className="text-sm leading-6 text-slate-600">{cp("description")}</p>
      <SavedCardPicker cards={cards} value={selected} disabled={busy} onChange={value => {setSelected(value); setCvc("");}} />
      {!selected ? <>
        <label className="block space-y-1"><span>{t("cardNumber")}</span><input className={inputClass} dir="ltr" inputMode="numeric" autoComplete="cc-number" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g,"").slice(0,19))} required disabled={busy} minLength={13} /></label>
        <label className="block space-y-1"><span>{t("cardExpiry")}</span><input className={inputClass} dir="ltr" placeholder="MM/YY" autoComplete="cc-exp" value={expiry} onChange={e => {const v=e.target.value.replace(/\D/g,"").slice(0,4);setExpiry(v.length>2?`${v.slice(0,2)}/${v.slice(2)}`:v);}} pattern="[0-9]{2}/[0-9]{2}" required disabled={busy} /></label>
        <label className="block space-y-1"><span>{t("cardHolder")}</span><input className={inputClass} autoComplete="cc-name" value={holder} onChange={e => setHolder(e.target.value)} required maxLength={120} disabled={busy} /></label>
      </> : null}
      <label className="block space-y-1"><span>CVC</span><input className={inputClass} dir="ltr" type="password" inputMode="numeric" autoComplete="cc-csc" value={cvc} onChange={e => setCvc(e.target.value.replace(/\D/g,"").slice(0,4))} pattern="[0-9]{3,4}" required disabled={busy} /></label>
      {error ? <p role="alert" className="text-sm text-red-700">{cp("error")}</p> : null}
      <Button type="submit" disabled={busy} className="w-full whitespace-normal">{busy ? "…" : cp("submit")}</Button>
    </form> : null}
  </details>;
}

/** A URL flag alone can never claim the bank verified a card. */
export function SubscriptionCardChangeResult() {
  const cp = useTranslations("ProfileCardUpdate"), [result, setResult] = useState<boolean | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search), id = params.get("subscriptionId"), verificationId = params.get("verificationId");
    if (!params.has("cardUpdate")) return;
    if (!id || !verificationId || !/^[a-f0-9]{24}$/i.test(id) || !/^[a-f0-9]{24}$/i.test(verificationId)) { setResult(false); return; }
    const controller = new AbortController();
    fetch(`/api/users/me/subscriptions/${id}/card?verificationId=${verificationId}`, {cache:"no-store",signal:AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])}).then(async r => { const data=await r.json(); if(!controller.signal.aborted)setResult(r.ok && data.verified===true); }).catch(()=>{if(!controller.signal.aborted)setResult(false);});
    return () => controller.abort();
  }, []);
  return result === null ? null : <p role="status" className={`mb-4 rounded-xl border p-4 ${result ? "bg-green-50 text-green-900" : "bg-red-50 text-red-800"}`}>{cp(result ? "success" : "error")}</p>;
}
