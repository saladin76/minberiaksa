"use client";
import { useEffect, useState } from "react";
import { dt } from "@/lib/dashboard/i18n";
type Account = { conversionId: string | null; conversionLabel: string | null; trackingEnabled: boolean; id: string; name: string; customerId: string; managerId: string | null; clientId: string | null; enabled: boolean; fundingType: "PAID" | "AD_GRANTS" | "UNSPECIFIED"; revision: string; status: string; lastTestAt: string | null; secrets: Record<string, boolean> };
const empty = { conversionId: "", conversionLabel: "", trackingEnabled: false, name: "", customerId: "", managerId: "", clientId: "", clientSecret: "", refreshToken: "", developerToken: "", enabled: true, fundingType: "PAID" as Account["fundingType"] };
const field = "w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm";
async function request(body?: unknown) {
  const response = await fetch("/api/admin/google-search/accounts", { cache: "no-store", signal: AbortSignal.timeout(20000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 403 ? dt("ليس لديك صلاحية لهذا الإجراء") : data.error === "CUSTOMER_ALREADY_CONNECTED" ? dt("هذا الحساب مضاف بالفعل. اختره من القائمة بدل إضافته مرة أخرى.") : data.error === "CONVERSION_TARGET_REQUIRED" ? dt("أضف معرف التحويل ووسمه قبل تفعيل التتبع.") : data.error === "ACCOUNT_CHANGED_RELOAD" ? dt("تغير الحساب. أعد تحميله قبل الحفظ أو الاختبار.") : dt("تعذر إكمال الإجراء: {0}", [data.error || response.status]));
  return data;
}
export function GoogleSearchAccounts({ onChanged, initialOpen = false, canManage = true, canTest = true }: { onChanged: () => void; initialOpen?: boolean; canManage?: boolean; canTest?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]), [selected, setSelected] = useState<Account | null>(null), [draft, setDraft] = useState(empty);
  const [open, setOpen] = useState(initialOpen), [busy, setBusy] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState("");
  const load = async () => { const data = await request(); setAccounts(data.accounts); return data.accounts as Account[]; };
  useEffect(() => { if (!open) return; let active = true; request().then(data => { if (active) setAccounts(data.accounts); }).catch(failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, [open]);
  const edit = (account: Account | null) => { setSelected(account); setMessage(""); setError(""); setDraft(account ? { ...empty, name: account.name, customerId: account.customerId, managerId: account.managerId || "", clientId: account.clientId || "", enabled: account.enabled, fundingType: account.fundingType, conversionId: account.conversionId || "", conversionLabel: account.conversionLabel || "", trackingEnabled: account.trackingEnabled } : { ...empty }); };
  const save = async () => {
    if (!canManage) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const data = await request({ action: "save", ...draft, ...(selected ? { id: selected.id, revision: selected.revision } : {}) });
      const rows = await load(); edit(rows.find(row => row.id === data.id) ?? null); onChanged(); setMessage(dt("تم حفظ الحساب. اختبر الاتصال بعد الحفظ."));
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(""); }
  };
  const test = async () => {
    if (!selected || !canTest) return; setBusy("test"); setError(""); setMessage("");
    try { const result = await request({ action: "test", id: selected.id, revision: selected.revision }); const rows = await load(); edit(rows.find(row => row.id === selected.id) ?? null); onChanged(); setMessage(dt("نجح اختبار القراءة: {0} · {1}", [result.currency, result.timezone])); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(""); }
  };
  const dirty = selected ? draft.name !== selected.name || draft.managerId !== (selected.managerId || "") || draft.clientId !== (selected.clientId || "") || draft.enabled !== selected.enabled || draft.fundingType !== selected.fundingType || draft.conversionId !== (selected.conversionId || "") || draft.conversionLabel !== (selected.conversionLabel || "") || draft.trackingEnabled !== selected.trackingEnabled || Boolean(draft.clientSecret || draft.refreshToken || draft.developerToken) : true;
  return <section className="rounded-2xl border bg-white p-4">
    <button type="button" aria-expanded={open} className="font-semibold text-brand" onClick={() => setOpen(value => !value)}>{dt("إدارة حسابات Google Ads")}</button>
    {open ? <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-2"><button type="button" disabled={Boolean(busy) || !canManage} className={field} onClick={() => edit(null)}>{dt("إضافة حساب إعلاني")}</button>{accounts.map(account => <button key={account.id} type="button" disabled={Boolean(busy)} className={field + (selected?.id === account.id ? " border-brand bg-sky-50" : "")} onClick={() => edit(account)}><span className="block break-words font-semibold">{account.name}</span><span dir="ltr" className="block text-xs">{account.customerId} · {account.fundingType === "AD_GRANTS" ? "Ad Grants" : account.fundingType === "PAID" ? dt("مدفوع") : dt("غير محدد")}</span><span className="text-xs">{account.enabled ? dt("مفعل") : dt("معطل")} · {account.lastTestAt ? dt("آخر اختبار: {0}", [new Date(account.lastTestAt).toLocaleString()]) : dt("لم يتم الاختبار")}</span></button>)}</div>
      <form onSubmit={event => { event.preventDefault(); void save(); }} className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">{([ ["name", dt("اسم الحساب")], ["customerId", "Customer ID"], ["managerId", "Manager ID (MCC)"], ["clientId", "OAuth Client ID"], ["clientSecret", "Client Secret"], ["refreshToken", "Refresh Token"], ["developerToken", "Developer Token"], ["conversionId", "Conversion ID (AW-…)"], ["conversionLabel", "Conversion Label"] ] as const).map(([key, label]) => <label key={key} className="min-w-0 space-y-1 text-sm"><span>{label}</span><input aria-label={label} required={key === "name" || key === "customerId"} disabled={!canManage || Boolean(busy) || (key === "customerId" && Boolean(selected))} type={["clientSecret", "refreshToken", "developerToken"].includes(key) ? "password" : "text"} autoComplete="off" value={draft[key]} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} placeholder={selected?.secrets[key] ? dt("محفوظ؛ اتركه فارغًا للإبقاء عليه") : ""} className={field} dir={key === "name" ? undefined : "ltr"} /></label>)}</div>
        <label className="block space-y-1 text-sm"><span>{dt("نوع تمويل الحساب")}</span><select disabled={!canManage || Boolean(busy)} className={field} value={draft.fundingType} onChange={event => setDraft({ ...draft, fundingType: event.target.value as Account["fundingType"] })}><option value="UNSPECIFIED" disabled>{dt("اختر نوع التمويل")}</option><option value="PAID">{dt("مدفوع")}</option><option value="AD_GRANTS">Google Ad Grants</option></select></label>
        <p className="text-xs leading-6 text-slate-500">{dt("نوع التمويل للتنظيم حسب اختيارك؛ أهلية المنحة وقيود الحساب يحددها Google. الاختبار يقرأ الحساب المحفوظ فقط ولا ينشئ إعلانًا.")}</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!canManage || Boolean(busy)} checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />{dt("تفعيل هذا الاتصال")}</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!canManage || Boolean(busy)} checked={draft.trackingEnabled} onChange={event => setDraft({ ...draft, trackingEnabled: event.target.checked })} />{dt("تسجيل التبرعات المؤكدة كتحويلات في هذا الحساب")}</label><p className="text-xs leading-6 text-slate-500">{dt("يمكن إضافة حسابات مدفوعة ومنح متعددة. بيانات API لإدارة الحملات، ومعرف التحويل ووسمه لتتبع التبرعات؛ تفعيل أحدهما لا يثبت عمل الآخر.")}</p>
        {error ? <p role="alert" className="break-words text-sm text-red-700">{error}</p> : null}{message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
        <div className="flex flex-wrap gap-2"><button disabled={!canManage || Boolean(busy) || draft.fundingType === "UNSPECIFIED"} className="rounded-lg bg-brand px-4 py-2 text-sm text-white">{busy === "save" ? dt("جار الحفظ…") : dt("حفظ الحساب")}</button><button type="button" onClick={test} disabled={!canTest || !selected || dirty || Boolean(busy)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">{busy === "test" ? dt("جار الاختبار…") : dt("اختبار الاتصال المحفوظ")}</button><button type="button" disabled={Boolean(busy)} className="rounded-lg border px-4 py-2 text-sm" onClick={() => { load().then(rows => edit(rows.find(row => row.id === selected?.id) ?? null)).catch(failure => setError(failure.message)); }}>{dt("إعادة تحميل")}</button></div>
      </form>
    </div> : null}
  </section>;
}
