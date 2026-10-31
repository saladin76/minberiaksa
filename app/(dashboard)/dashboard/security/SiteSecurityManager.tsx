"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCountries } from "libphonenumber-js";
import { dt, dashDir, dashIntl } from "@/lib/dashboard/i18n";
import type { AccessRule } from "@/lib/site-security/policy";
type Visit = {
  id: string;
  ip: string;
  country: string | null;
  path: string;
  blocked: boolean;
  visits: number;
  lastSeenAt: string;
  donor: { id: string; name: string | null; email: string | null } | null;
};
type Snapshot = {
  rows: Visit[];
  total: number;
  page: number;
  rules: AccessRule[];
  retentionDays: number;
  searchTruncated?: boolean;
};
const field = "w-full rounded-lg border p-2 text-sm";
export default function SiteSecurityManager() {
  const [data, setData] = useState<Snapshot | null>(null),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [kind, setKind] = useState<"IP" | "COUNTRY">("IP"),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [action, setAction] = useState("BLOCK"),
    [hours, setHours] = useState("24");
  const names = new Intl.DisplayNames([dashIntl("ar")], { type: "region" });
  const loadController = useRef<AbortController | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const response = await fetch(
        `/api/admin/site-security?page=${page}&q=${encodeURIComponent(query)}`,
        {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!response.ok) throw new Error(dt("تعذر تحميل سجل الوصول"));
      const snapshot = await response.json();
      if (!controller.signal.aborted) setData(snapshot);
    } catch (failure) {
      if (!controller.signal.aborted) throw failure;
    } finally {
      if (loadController.current === controller) loadController.current = null;
    }
  }, [page, query]);
  useEffect(() => {
    setError("");
    void load().catch((failure) => setError(failure.message));
    return () => loadController.current?.abort();
  }, [load]);
  const mutate = async (body: unknown, method = "POST") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/site-security", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          dt("تعذر حفظ قاعدة الوصول. راجع البيانات وأعد تحميل القائمة."),
        );
      setNotice(dt("تم حفظ قاعدة الوصول"));
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main dir={dashDir()} className="space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">{dt("الأمان وسجل الوصول")}</h1>
      <p className="text-sm leading-7 text-slate-600">
        {dt(
          "سجل خاص بالإدارة يربط زيارات الأعضاء بعناوين IP. يبدأ التسجيل بعد نشر الميزة، وتُحفظ السجلات 90 يومًا. عدد الزيارات تقريبي لأن التسجيل يُجمع مرة كل دقيقة للعنوان والعضو.",
        )}
      </p>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-bold">{dt("إضافة قاعدة وصول")}</h2>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate({
              kind,
              value,
              action,
              reason,
              expiresInHours: hours ? Number(hours) : null,
            });
          }}
        >
          <label className="space-y-1 text-sm">
            <span>{dt("نوع القاعدة")}</span>
            <select
              className={field}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as typeof kind);
                setValue("");
              }}
            >
              <option value="IP">IP / CIDR</option>
              <option value="COUNTRY">{dt("دولة")}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{kind === "IP" ? "IP / CIDR" : dt("الدولة")}</span>
            {kind === "IP" ? (
              <input
                dir="ltr"
                required
                className={field}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="203.0.113.7 / 203.0.113.0/24"
              />
            ) : (
              <select
                required
                className={field}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                <option value="">{dt("اختر الدولة")}</option>
                {getCountries().map((code) => (
                  <option key={code} value={code}>
                    {names.of(code)} ({code})
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="space-y-1 text-sm">
            <span>{dt("الإجراء")}</span>
            <select
              className={field}
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="BLOCK">{dt("حظر الوصول")}</option>
              <option value="ALLOW">{dt("السماح كاستثناء من الحظر")}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{dt("سبب القاعدة")}</span>
            <input
              className={field}
              required
              minLength={3}
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{dt("مدة القاعدة بالساعات؛ فارغ للدائم")}</span>
            <input
              className={field}
              type="number"
              min={1}
              max={8760}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </label>
          <button
            disabled={busy}
            className="self-end rounded-lg bg-brand px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? dt("جار الحفظ…") : dt("حفظ قاعدة الوصول")}
          </button>
        </form>
        <p className="mt-3 text-xs leading-6 text-slate-500">
          {dt(
            "تسري التغييرات خلال 5 ثوانٍ. قواعد IP لها الأولوية على قواعد الدول، والسماح يستثني العنوان من الحظر. تبقى الإدارة وتسجيل الدخول وإشعارات الدفع متاحة للاستعادة وتشغيل التبرعات. حظر الدول يعتمد على تحديد بلد IP، وقد يبقى البلد غير معروف. هذه ضوابط وصول داخل التطبيق وليست بديلًا لحماية الهجمات لدى الاستضافة.",
          )}
        </p>
      </section>
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {data?.searchTruncated ? (
        <p className="text-sm text-amber-800">
          {dt(
            "تطابق أكثر من 100 عضو مع البحث. استخدم اسمًا أو بريدًا أدق لإظهار كل النتائج المطلوبة.",
          )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      ) : null}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-bold">{dt("قواعد الوصول")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-start text-sm">
            <thead>
              <tr>
                {[
                  dt("النوع"),
                  dt("القيمة"),
                  dt("الإجراء"),
                  dt("السبب"),
                  dt("الحالة"),
                  dt("الإجراءات"),
                ].map((label) => (
                  <th key={label} className="p-2 text-start">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="p-2">{rule.kind}</td>
                  <td className="p-2" dir="ltr">
                    {rule.value}
                  </td>
                  <td className="p-2">
                    {rule.action === "ALLOW" ? dt("سماح") : dt("حظر")}
                  </td>
                  <td className="max-w-xs break-words p-2">{rule.reason}</td>
                  <td className="p-2">
                    {!rule.enabled
                      ? dt("موقوفة")
                      : rule.expiresAt &&
                          new Date(rule.expiresAt).getTime() <= Date.now()
                        ? dt("منتهية")
                        : rule.expiresAt
                          ? new Date(rule.expiresAt).toLocaleString(
                              dashIntl("ar"),
                            )
                          : dt("دائمة")}
                  </td>
                  <td className="p-2">
                    <button
                      disabled={!rule.enabled || busy}
                      className="rounded border px-3 py-2 disabled:opacity-40"
                      onClick={() =>
                        void mutate(
                          { id: rule.id, updatedAt: rule.updatedAt },
                          "DELETE",
                        )
                      }
                    >
                      {dt("رفع القاعدة")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
          <h2 className="font-bold">{dt("الأعضاء وعناوين الوصول")}</h2>
          <form
            className="flex w-full min-w-0 gap-2 sm:flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search);
            }}
          >
            <input
              aria-label={dt("بحث باسم أو بريد أو IP أو رمز دولة")}
              className={field}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="shrink-0 rounded border px-3">
              {dt("بحث")}
            </button>
          </form>
          <button
            className="w-fit rounded border p-2 text-sm"
            onClick={() =>
              void load().catch((failure) => setError(failure.message))
            }
          >
            {dt("تحديث")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr>
                {[
                  dt("العضو"),
                  "IP",
                  dt("الدولة"),
                  dt("آخر زيارة"),
                  dt("المسار"),
                  dt("الحالة"),
                  dt("الإجراءات"),
                ].map((label) => (
                  <th key={label} className="p-2 text-start">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2">
                    <span className="block">
                      {row.donor?.name || dt("زائر غير مسجل")}
                    </span>
                    <span className="text-xs text-slate-500">
                      {row.donor?.email}
                    </span>
                  </td>
                  <td dir="ltr" className="p-2 font-mono">
                    {row.ip}
                  </td>
                  <td className="p-2">
                    {row.country ? names.of(row.country) : dt("غير معروف")}
                  </td>
                  <td className="p-2">
                    {new Date(row.lastSeenAt).toLocaleString(dashIntl("ar"))}
                  </td>
                  <td className="max-w-xs break-all p-2 text-xs" dir="ltr">
                    {row.path}
                  </td>
                  <td className="p-2">
                    {row.blocked ? dt("محظور") : dt("مسموح")}
                  </td>
                  <td className="p-2">
                    <button
                      className="rounded border px-3 py-2"
                      onClick={() => {
                        setKind("IP");
                        setValue(row.ip);
                        setAction("BLOCK");
                      }}
                    >
                      {dt("إعداد حظر هذا العنوان")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.rows.length ? (
          <p className="p-5 text-sm text-slate-500">
            {dt(
              "لا توجد سجلات مطابقة بعد. تظهر الزيارات الجديدة بعد تفعيل النسخة.",
            )}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            disabled={page === 1}
            className="rounded border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage((p) => p - 1)}
          >
            {dt("السابق")}
          </button>
          <span>
            {page} · {data?.total ?? "—"}
          </span>
          <button
            disabled={!data || page * 30 >= data.total}
            className="rounded border px-3 py-2 disabled:opacity-40"
            onClick={() => setPage((p) => p + 1)}
          >
            {dt("التالي")}
          </button>
        </div>
      </section>
    </main>
  );
}
