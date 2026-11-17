"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";

type Gateway = "PAYFOR" | "ALBARAKA";
type Choice = Gateway | "AUTO";
type MatchBy = "ANY" | "IP" | "PHONE";
type Donor = { id: string; name: string | null; email: string | null; phone: string | null };
type Override = { userId: string; gateway: Gateway; reason: string; setBy: string; setAt: string };
type CountryRule = { country: string; gateway: Gateway; matchBy: MatchBy; reason: string; setBy: string; setAt: string };
type LogRow = { at: string; scope: "DONOR" | "COUNTRY"; userId?: string; country?: string; from: Choice; to: Choice; reason: string; by: string };
const API = "/api/admin/donor-gateway-override";
const label = (c: Choice) => (c === "PAYFOR" ? "PayFor (Ziraat Katılım)" : c === "ALBARAKA" ? "Albaraka" : dt("تلقائي"));
const matchLabel = (m: MatchBy) => (m === "PHONE" ? dt("بالهاتف فقط") : m === "IP" ? dt("بالموقع (IP) فقط") : dt("بالهاتف أو الموقع (IP)"));
const who = (d: Donor | undefined, id: string) => (d ? [d.name, d.email, d.phone].filter(Boolean).join(" · ") : id);

function useCountryNames(): { list: Array<{ code: string; name: string }>; name: (c: string) => string } {
  return useMemo(() => {
    const lang = typeof document !== "undefined" ? document.documentElement.lang || "ar" : "ar";
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames([lang, "en"], { type: "region" }); } catch { names = null; }
    const name = (c: string) => names?.of(c) ?? c;
    const list: Array<{ code: string; name: string }> = [];
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const n = names?.of(code);
      if (n && n !== code && !["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"].includes(code)) list.push({ code, name: n });
    }
    list.sort((x, y) => x.name.localeCompare(y.name, lang));
    return { list, name };
  }, []);
}

/** Pin the payment gateway for individual donors or whole countries (new one-time card donations), with reasons and one change log. */
export default function DonorGatewayOverrides() {
  const countries = useCountryNames();
  const [overrides, setOverrides] = useState<Override[]>([]), [rules, setRules] = useState<CountryRule[]>([]), [log, setLog] = useState<LogRow[]>([]), [donors, setDonors] = useState<Record<string, Donor>>({});
  const [q, setQ] = useState(""), [found, setFound] = useState<Donor[] | null>(null);
  const [target, setTarget] = useState<Donor | null>(null), [choice, setChoice] = useState<Choice>("PAYFOR"), [reason, setReason] = useState("");
  const [country, setCountry] = useState(""), [cChoice, setCChoice] = useState<Gateway>("PAYFOR"), [matchBy, setMatchBy] = useState<MatchBy>("ANY"), [cReason, setCReason] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      const data = (await r.json()) as { overrides: Override[]; countryRules: CountryRule[]; log: LogRow[]; donors: Donor[] };
      setOverrides(data.overrides); setRules(data.countryRules); setLog(data.log); setDonors(Object.fromEntries(data.donors.map((d) => [d.id, d])));
    } catch { setError(dt("تعذر تحميل تحويلات بوابة الدفع")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const search = async () => {
    setError(""); setFound(null);
    try {
      const r = await fetch(`${API}?q=${encodeURIComponent(q.trim())}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      setFound(((await r.json()) as { donors: Donor[] }).donors);
    } catch { setError(dt("تعذر البحث عن المتبرع")); }
  };

  const post = async (body: Record<string, unknown>) => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      setNotice(dt("تم الحفظ. يسري على التبرعات الجديدة خلال ثوانٍ."));
      await load();
      return true;
    } catch { setError(dt("تعذر حفظ التحويل")); return false; }
    finally { setBusy(false); }
  };
  const askReason = () => { const why = window.prompt(dt("سبب الإلغاء")); return why && why.trim().length >= 3 ? why.trim() : null; };

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4" aria-label={dt("تحويل بوابة الدفع")}>
      <h2 className="text-base font-bold">{dt("تحويل بوابة الدفع")}</h2>
      <p className="mt-1 text-xs text-slate-600">{dt("يسري على التبرعات الجديدة لمرة واحدة بالبطاقة. البطاقات المحفوظة والاشتراكات الشهرية تبقى على بوابتها. عند الدفع عبر PayFor يرى المتبرع المبلغ المعادل بالليرة التركية. الأولوية: المتبرع، ثم الدولة.")}</p>

      <h3 className="mt-4 text-sm font-bold">{dt("حسب المتبرع")}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="min-w-64 flex-1 rounded-lg border p-2 text-sm" placeholder={dt("بريد المتبرع أو هاتفه")} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) void search(); }} />
        <button type="button" disabled={!q.trim()} onClick={() => void search()} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40">{dt("بحث")}</button>
      </div>
      {found && (found.length === 0
        ? <p className="mt-2 text-sm text-slate-500">{dt("لا يوجد متبرع بهذا البريد أو الهاتف")}</p>
        : <ul className="mt-2 space-y-1">{found.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              <span>{who(d, d.id)}</span>
              <button type="button" onClick={() => { setTarget(d); setChoice("PAYFOR"); setReason(""); }} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white">{dt("اختيار")}</button>
            </li>))}</ul>)}
      {target && (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-semibold">{who(target, target.id)}</p>
          <div className="mt-2 flex flex-wrap gap-3">{(["PAYFOR", "ALBARAKA", "AUTO"] as const).map((c) => (
            <label key={c} className="flex items-center gap-1 text-sm"><input type="radio" name="donor-gateway" checked={choice === c} onChange={() => setChoice(c)} />{label(c)}</label>))}</div>
          <input className="mt-2 w-full rounded-lg border p-2 text-sm" placeholder={dt("سبب التحويل (إلزامي)")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={async () => { if (await post({ scope: "DONOR", userId: target.id, gateway: choice, reason: reason.trim() })) { setTarget(null); setReason(""); setFound(null); setQ(""); } }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">{dt("حفظ")}</button>
            <button type="button" onClick={() => setTarget(null)} className="rounded-lg border px-3 py-1.5 text-sm">{dt("إلغاء")}</button>
          </div>
        </div>)}
      {overrides.length === 0 ? <p className="mt-2 text-sm text-slate-500">{dt("لا يوجد متبرعون محوَّلون")}</p> : (
        <ul className="mt-2 space-y-1">{overrides.map((o) => (
          <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
            <span>{who(donors[o.userId], o.userId)} ← <b>{label(o.gateway)}</b> · <span className="text-slate-500">{o.reason}</span></span>
            <button type="button" disabled={busy} onClick={() => { const why = askReason(); if (why) void post({ scope: "DONOR", userId: o.userId, gateway: "AUTO", reason: why }); }} className="rounded-lg border px-3 py-1 text-xs">{dt("إلغاء التحويل")}</button>
          </li>))}</ul>)}

      <h3 className="mt-5 text-sm font-bold">{dt("حسب الدولة")}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select className="rounded-lg border p-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)} aria-label={dt("الدولة")}>
          <option value="">{dt("اختر الدولة")}</option>
          {countries.list.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </select>
        <select className="rounded-lg border p-2 text-sm" value={matchBy} onChange={(e) => setMatchBy(e.target.value as MatchBy)} aria-label={dt("طريقة التعرف على الدولة")}>
          {(["ANY", "PHONE", "IP"] as const).map((m) => <option key={m} value={m}>{matchLabel(m)}</option>)}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">{(["PAYFOR", "ALBARAKA"] as const).map((c) => (
        <label key={c} className="flex items-center gap-1 text-sm"><input type="radio" name="country-gateway" checked={cChoice === c} onChange={() => setCChoice(c)} />{label(c)}</label>))}</div>
      <input className="mt-2 w-full rounded-lg border p-2 text-sm" placeholder={dt("سبب التحويل (إلزامي)")} value={cReason} maxLength={300} onChange={(e) => setCReason(e.target.value)} />
      <p className="mt-1 text-xs text-slate-500">{dt("التعرف بالموقع (IP) قد يضيف حتى ثانية لتحميل صفحة الدفع. التعرف بالهاتف لا يبطئها.")}</p>
      <button type="button" disabled={busy || !country || cReason.trim().length < 3} onClick={async () => { if (await post({ scope: "COUNTRY", country, matchBy, gateway: cChoice, reason: cReason.trim() })) { setCountry(""); setCReason(""); } }} className="mt-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">{dt("حفظ قاعدة الدولة")}</button>
      {rules.length === 0 ? <p className="mt-2 text-sm text-slate-500">{dt("لا توجد قواعد دول")}</p> : (
        <ul className="mt-2 space-y-1">{rules.map((r) => (
          <li key={r.country} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
            <span>{countries.name(r.country)} ← <b>{label(r.gateway)}</b> · {matchLabel(r.matchBy)} · <span className="text-slate-500">{r.reason}</span></span>
            <button type="button" disabled={busy} onClick={() => { const why = askReason(); if (why) void post({ scope: "COUNTRY", country: r.country, matchBy: r.matchBy, gateway: "AUTO", reason: why }); }} className="rounded-lg border px-3 py-1 text-xs">{dt("إلغاء القاعدة")}</button>
          </li>))}</ul>)}

      <h3 className="mt-5 text-sm font-bold">{dt("سجل التحويلات")}</h3>
      {log.length === 0 ? <p className="text-sm text-slate-500">{dt("لا توجد تحويلات بعد")}</p> : (
        <ul className="mt-1 space-y-1 text-xs text-slate-700">{log.slice(0, 30).map((l, i) => (
          <li key={i}>{new Date(l.at).toLocaleString()} · {l.scope === "COUNTRY" ? countries.name(l.country ?? "") : who(donors[l.userId ?? ""], l.userId ?? "")} · {label(l.from)} → {label(l.to)} · {l.reason} · {l.by}</li>))}</ul>)}

      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
    </section>
  );
}
