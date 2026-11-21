"use client";
import { useCallback, useEffect, useState } from "react";
import { dt, dashIntl } from "@/lib/dashboard/i18n";

type Mode = "OFF" | "DONATIONS" | "SITE";
type State = { mode: Mode; changedAt: string | null; changedBy: string | null };
const CONFIRM_TOKEN = "CONFIRM_EMERGENCY";

/** Emergency switch, two levels: pause donations (site stays up), or close the public site. */
export default function EmergencySwitch() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [asking, setAsking] = useState<Mode | null>(null), [typed, setTyped] = useState(""), [busy, setBusy] = useState(false);
  const word = dt("إيقاف");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/site-security/emergency", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error();
      setState(await r.json());
    } catch { setError(dt("تعذر تحميل حالة الموقع")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const change = async (mode: Mode) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/admin/site-security/emergency", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify(mode === "OFF" ? { mode } : { mode, confirm: CONFIRM_TOKEN }),
      });
      if (!r.ok) throw new Error();
      setState(await r.json());
      setNotice(dt("تم تطبيق التغيير. قد يستغرق حتى 5 ثوانٍ."));
      setAsking(null); setTyped("");
    } catch { setError(dt("تعذر تغيير حالة الموقع")); }
    finally { setBusy(false); }
  };

  const mode = state?.mode ?? "OFF";
  const tone = mode === "SITE" ? "border-red-300 bg-red-50" : mode === "DONATIONS" ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50";
  const label = mode === "SITE" ? dt("الموقع مغلق بالكامل (وضع الطوارئ)") : mode === "DONATIONS" ? dt("التبرعات متوقفة · الموقع يعمل") : dt("الموقع يعمل بشكل طبيعي");
  return (
    <section className={`mb-6 rounded-xl border p-4 ${tone}`} aria-label={dt("حالة الموقع")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{dt("حالة الموقع")}</h2>
          <p className="text-sm font-semibold" role="status">{state ? label : "…"}</p>
          {state?.changedAt && <p className="text-xs text-slate-500">{dt("آخر تغيير {0} · بواسطة {1}", [new Date(state.changedAt).toLocaleString(dashIntl("ar"), { timeZone: "Europe/Istanbul" }), state.changedBy ?? "—"])}</p>}
        </div>
        {state && (
          <div className="flex flex-wrap gap-2">
            {mode !== "OFF" && <button type="button" disabled={busy} onClick={() => { if (window.confirm(dt("هل تريد إعادة تشغيل الموقع والتبرعات للجميع؟"))) void change("OFF"); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{dt("إعادة التشغيل الكامل")}</button>}
            {mode === "OFF" && <button type="button" disabled={busy} onClick={() => setAsking("DONATIONS")} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{dt("إيقاف التبرعات")}</button>}
            {mode !== "SITE" && <button type="button" disabled={busy} onClick={() => setAsking("SITE")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{dt("إغلاق الموقع بالكامل")}</button>}
          </div>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        <li>{dt("إيقاف التبرعات: الموقع يبقى ظاهراً، ويتوقف بدء أي دفع جديد، ويظهر للزوار شريط بأن نظام التبرع قيد التحسين. الدفعات التي بدأت عند البنك تكتمل وتُسجَّل.")}</li>
        <li>{dt("إغلاق الموقع: تظهر صفحة صيانة للزوار. تبقى لوحة التحكم وتسجيل الدخول وردود البنوك تعمل.")}</li>
      </ul>
      {asking && (
        <div className="mt-3 rounded-lg border border-red-300 bg-white p-3">
          <p className="text-sm font-bold">{asking === "SITE" ? dt("إغلاق الموقع بالكامل") : dt("إيقاف التبرعات")}</p>
          <label className="mt-1 block text-sm text-red-700" htmlFor="emergency-confirm">{dt("للتأكيد اكتب الكلمة: {0}", [word])}</label>
          <input id="emergency-confirm" className="mt-2 w-full rounded-lg border p-2 text-sm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || typed.trim() !== word} onClick={() => void change(asking)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">{dt("تأكيد")}</button>
            <button type="button" onClick={() => { setAsking(null); setTyped(""); }} className="rounded-lg border px-3 py-1.5 text-sm">{dt("إلغاء")}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
    </section>
  );
}
