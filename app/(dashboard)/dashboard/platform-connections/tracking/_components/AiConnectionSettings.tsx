"use client";
import { useCallback, useEffect, useId, useState } from "react";
import axios from "axios";
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Save, Sparkles, TestTube2 } from "lucide-react";
import type { AiConnectionSnapshot } from "@/lib/ai/core/connection-config";
import { providerErrorMessage } from "@/lib/ai/core/provider-error-message";
import { dashIntl, dt } from "@/lib/dashboard/i18n";

function message(error: unknown) {
  const code = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
  switch (code) {
    case "AI_SETTINGS_CONFLICT": return dt("تغير الاتصال في جلسة أخرى. حدّث الإعدادات قبل الحفظ.");
    case "AI_ENCRYPTION_NOT_CONFIGURED": return dt("الحفظ اليدوي يحتاج تهيئة تشفير المفاتيح على الخادم.");
    case "AI_KEY_REQUIRED": return dt("أدخل مفتاح API قبل تفعيل الاتصال أو اختباره.");
    case "AI_KEY_INVALID": return dt("صيغة مفتاح OpenAI غير صالحة. الصق المفتاح كاملًا دون مسافات.");
    case "AI_SETTINGS_INVALID": return dt("راجع اسم النموذج والحقول المدخلة.");
    case "AI_CLEAR_KEY_REQUIRES_DISABLED": return dt("أوقف الاتصال قبل إزالة المفتاح المحفوظ.");
    case "AI_KEY_UNREADABLE": return dt("تعذر فك تشفير المفتاح المحفوظ. راجع إعداد التشفير على الخادم.");
    default: return typeof code === "string" && code !== "AI_SETTINGS_UNAVAILABLE" ? providerErrorMessage(code) : dt("تعذر تحميل أو حفظ اتصال الذكاء الاصطناعي. أعد المحاولة.");
  }
}
export default function AiConnectionSettings({ canManage, canTest }: { canManage: boolean; canTest: boolean }) {
  const id = useId();
  const [saved, setSaved] = useState<AiConnectionSnapshot | null>(null);
  const [model, setModel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tested, setTested] = useState(false);
  const [conflict, setConflict] = useState(false);
  const dirty = Boolean(saved && (model !== saved.model || enabled !== saved.enabled || apiKey.trim() || clearKey));
  const resetFeedback = () => { setNotice(""); setError(""); setTested(false); };
  const apply = (settings: AiConnectionSnapshot) => { if (typeof settings.model !== "string" || typeof settings.enabled !== "boolean" || typeof settings.keyPresent !== "boolean" || typeof settings.canSave !== "boolean" || !(settings.revision === null || typeof settings.revision === "string")) throw new Error("Invalid settings"); setSaved(settings); setModel(settings.model); setEnabled(settings.enabled); setApiKey(""); setClearKey(false); setConflict(false); };
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(""); setNotice(""); setTested(false);
    try { const response = await axios.get("/api/admin/ai/connection", { signal, timeout: 20000 }); if (response.data?.ok !== true || !response.data.settings) throw new Error("Invalid settings"); apply(response.data.settings); }
    catch (error) { if (!signal?.aborted) { setSaved(null); setError(message(error)); } }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function save() {
    if (!saved || !canManage || busy || loading || !saved.canSave) return;
    setBusy("save"); resetFeedback();
    try {
      const response = await axios.put("/api/admin/ai/connection", { revision: saved.revision, model, enabled, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), clearKey }, { timeout: 20000 });
      if (response.data?.ok !== true || !response.data.settings) throw new Error("Invalid settings");
      apply(response.data.settings); setNotice(dt("تم حفظ اتصال الذكاء الاصطناعي للموقع. تسري الإعدادات على الطلبات الجديدة."));
    } catch (error) { setError(message(error)); if (axios.isAxiosError(error) && error.response?.data?.error === "AI_SETTINGS_CONFLICT") setConflict(true); } finally { setBusy(null); }
  }
  async function test() {
    if (!saved || !canTest || busy || loading || clearKey) return;
    setBusy("test"); resetFeedback();
    try {
      const response = await axios.post("/api/admin/ai/connection", canManage ? { model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } : {}, { timeout: 20000 });
      if (response.data?.ok !== true || response.data.result?.check !== "MODEL_ACCESS") throw new Error("Invalid test result");
      setTested(true); setNotice(dt("نجح اختبار الوصول إلى النموذج {0}. لم يُحفظ الاختبار ولم يُنشأ محتوى؛ الرصيد والتوليد يحتاجان تحققًا منفصلًا.", [response.data.result.model]));
    } catch (error) { setError(message(error)); } finally { setBusy(null); }
  }
  return <section id="ai-connection" aria-labelledby={id + "-title"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-slate-50/70 p-5">
      <div className="flex min-w-0 flex-1 gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Sparkles size={22} /></span><div><h2 id={id + "-title"} className="text-base font-bold text-slate-900">{dt("اتصال الذكاء الاصطناعي للموقع")}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{dt("اربط OpenAI يدويًا بمفتاح مركزي للمساعد والتحليلات والترجمة والمحرر وSEO. يُحفظ المفتاح مشفرًا ولا يظهر بعد الحفظ.")}</p></div></div>
      <button type="button" disabled={loading || Boolean(busy) || dirty} onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm disabled:opacity-50"><RefreshCw size={15} />{dt("تحديث")}</button>
    </div>
    <div className="space-y-4 p-5">
      {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} />{dt("جارٍ تحميل الاتصال...")}</p> : null}
      {error || conflict ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{conflict ? dt("تغير الاتصال في جلسة أخرى. حدّث الإعدادات قبل الحفظ.") : error}{!saved || conflict ? <button type="button" onClick={() => void load()} className="ms-3 underline">{dt(conflict ? "تحميل الإعدادات الحالية وإلغاء التغييرات" : "إعادة المحاولة")}</button> : null}</div> : null}
      {!loading && saved ? <>
        <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full border px-3 py-1.5 ${saved.enabled && saved.keyPresent ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{saved.enabled && saved.keyPresent ? dt("الاتصال مفعّل") : dt("الاتصال غير مفعّل")}</span><span className="rounded-full border bg-white px-3 py-1.5 text-slate-600">{saved.source === "DATABASE" ? dt("المصدر: إعداد يدوي") : saved.source === "ENVIRONMENT" ? dt("المصدر: إعداد الخادم") : dt("لم يُربط مفتاح بعد")}</span><span className="rounded-full border bg-white px-3 py-1.5 text-slate-600">{dt("المزوّد: OpenAI")}</span></div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2"><label htmlFor={id + "-key"} className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} />{dt("مفتاح OpenAI API")}</label><input id={id + "-key"} type="password" autoComplete="new-password" spellCheck={false} dir="ltr" maxLength={512} value={apiKey} disabled={!canManage || Boolean(busy) || clearKey} placeholder={saved.keyPresent ? dt("محفوظ — اتركه فارغًا للإبقاء عليه") : "sk-..."} onChange={event => { setApiKey(event.target.value); resetFeedback(); }} className="min-h-11 w-full rounded-lg border px-3 font-mono text-sm disabled:bg-slate-50" /><p className="text-xs leading-5 text-slate-500">{dt("الحفظ اليدوي يصبح مصدر المفتاح لكل ميزات الذكاء الاصطناعي، ويظل إعداد الخادم مستخدمًا قبل أول حفظ.")}</p></div>
          <div className="space-y-2"><label htmlFor={id + "-model"} className="text-sm font-semibold">{dt("النموذج الافتراضي")}</label><input id={id + "-model"} dir="ltr" maxLength={120} value={model} disabled={!canManage || Boolean(busy)} onChange={event => { setModel(event.target.value); resetFeedback(); }} className="min-h-11 w-full rounded-lg border px-3 font-mono text-sm disabled:bg-slate-50" placeholder="gpt-4.1-mini" /><p className="text-xs leading-5 text-slate-500">{dt("تحتفظ أدوات البحث والمحتوى المتخصصة بنماذجها المخصصة، وتستخدم المفتاح المركزي نفسه.")}</p></div>
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={enabled} disabled={!canManage || Boolean(busy) || clearKey} onChange={event => { setEnabled(event.target.checked); resetFeedback(); }} />{dt("تفعيل اتصال الذكاء الاصطناعي في الموقع")}</label>
        {saved.keyPresent && canManage ? <label className="flex items-center gap-2 text-xs text-rose-700"><input type="checkbox" checked={clearKey} disabled={Boolean(busy)} onChange={event => { setClearKey(event.target.checked); if (event.target.checked) { setEnabled(false); setApiKey(""); } resetFeedback(); }} />{dt("إزالة المفتاح من الاتصال اليدوي وإيقافه عند الحفظ")}</label> : null}
        {!saved.canSave ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{dt("الحفظ اليدوي يحتاج تهيئة تشفير المفاتيح على الخادم.")}</p> : null}
        {dirty ? <p className="text-sm font-medium text-amber-700">{dt("لديك تغييرات لم تُحفظ بعد")}</p> : null}
        {notice ? <p role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tested ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-900"}`}><CheckCircle2 size={18} className="mt-0.5 shrink-0" />{notice}</p> : null}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {canManage ? <button type="button" onClick={() => void save()} disabled={Boolean(busy) || !dirty || !saved.canSave || conflict} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{dt("حفظ اتصال الذكاء الاصطناعي")}</button> : null}
          {canTest ? <button type="button" onClick={() => void test()} disabled={Boolean(busy) || clearKey || !model.trim() || !apiKey.trim() && !saved.keyPresent} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold text-brand disabled:opacity-50">{busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <TestTube2 size={16} />}{dt("اختبار الوصول للنموذج")}</button> : null}
          {saved.updatedAt ? <span className="text-xs text-slate-500">{dt("آخر حفظ: {0}", [new Date(saved.updatedAt).toLocaleString(dashIntl("ar-EG"), { timeZone: "Europe/Istanbul", timeZoneName: "short" })])}</span> : null}
        </div>
      </> : null}
    </div>
  </section>;
}
