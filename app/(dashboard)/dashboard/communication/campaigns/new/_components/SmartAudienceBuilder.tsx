"use client";

import * as React from "react";
import { Loader2, Search, X, Users, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/locales";
import { RECIPIENT_REASON_LABELS, type RecipientExclusionReason } from "@/lib/communication/campaign-audience-accounting";
import { dt, dtx } from "@/lib/dashboard/i18n";

export type SmartAudienceDraft = {
  version: 1;
  kind: "SMART";
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  filters: {
    excludeMarketedWithinDays?: number | null;
    countries?: string[];
    locales?: string[];
    donatedWithinDays?: number | null;
    notDonatedWithinDays?: number | null;
    projectIds?: string[];
    badgeIds?: string[];
    recurringOnly?: boolean;
    oneTimeOnly?: boolean;
    recurringFrequencies?: string[];
    excludeRecurringFrequencies?: string[];
    minDonationAmountUSD?: number | null;
    hasContact?: boolean;
  };
  excludeUserIds?: string[];
  fallbackLocale?: string | null;
};

export type SmartAudiencePreview = {
  matched: number;
  eligible: number;
  missingContact: number;
  doNotContact: number;
  needsReview?: number;
  unavailable: number;
  languages: Record<string, number>;
  eligibleLanguages?: Record<string, number>;
  sample: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    locale: string;
    countryCode: string | null;
    eligible: boolean;
    exclusionReason?: RecipientExclusionReason | null;
  }>;
};

type Facets = {
  countries: Array<{ code: string; name: string; count: number }>;
  projects: Array<{ id: string; name: string; slug: string | null }>;
};

type PickOption = { value: string; label: string; count?: number };

/** Several values at once (countries, languages, projects, badges): searchable checklist with counts (2026-11-21). */
function MultiPick({ label, allLabel, options, selected, onChange }: {
  label: string; allLabel: string; options: PickOption[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false), [q, setQ] = React.useState("");
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const chosen = options.filter((o) => selected.includes(o.value));
  const summary = chosen.length === 0 ? allLabel : chosen.length <= 2 ? chosen.map((o) => o.label).join("، ") : `${chosen.slice(0, 2).map((o) => o.label).join("، ")} +${chosen.length - 2}`;
  const shown = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="relative space-y-1 text-xs text-slate-600" ref={box}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-start text-sm ${chosen.length ? "border-emerald-400" : "border-slate-200"}`} aria-expanded={open}>
        <span className="truncate">{summary}</span>
        {chosen.length ? <span className="shrink-0 rounded-full bg-emerald-100 px-2 text-[11px] font-bold text-emerald-800">{chosen.length}</span> : null}
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-lg border bg-white p-2 shadow-lg">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={dt("بحث…")} className="mb-2 w-full rounded border px-2 py-1 text-sm" autoFocus />
          <div className="max-h-64 overflow-y-auto">
            {shown.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                <span className="flex-1 truncate">{o.label}</span>
                {typeof o.count === "number" ? <span className="text-[11px] text-slate-400">{o.count}</span> : null}
              </label>
            ))}
            {shown.length === 0 ? <p className="p-2 text-xs text-slate-400">{dt("لا نتائج")}</p> : null}
          </div>
          <div className="mt-2 flex justify-between border-t pt-2">
            <button type="button" onClick={() => onChange([])} className="text-xs text-slate-500 hover:text-red-600">{dt("مسح الاختيار")}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded bg-slate-800 px-2 py-1 text-xs text-white">{dt("تم")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DonorSearchResult = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

async function json(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || dt("تعذر تحميل البيانات"));
  return data;
}

export function SmartAudienceBuilder({
  channel,
  value,
  onChange,
  onPreview,
}: {
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  value: SmartAudienceDraft;
  onChange: (value: SmartAudienceDraft) => void;
  onPreview?: (preview: SmartAudiencePreview | null) => void;
}) {
  const [facets, setFacets] = React.useState<Facets>({ countries: [], projects: [] });
  const [badges, setBadges] = React.useState<PickOption[]>([]);
  React.useEffect(() => {
    fetch("/api/admin/badges", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const rows = (Array.isArray(data) ? data : data?.badges ?? []) as Array<{ id: string; name?: unknown; title?: unknown }>;
        const text = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>).ar ?? Object.values(v as Record<string, unknown>)[0] ?? "") : "");
        setBadges(rows.map((b) => ({ value: b.id, label: text(b.name) || text(b.title) || b.id })));
      })
      .catch(() => {});
  }, []);
  const [preview, setPreview] = React.useState<SmartAudiencePreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [previewAttempt, setPreviewAttempt] = React.useState(0);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [excludeQuery, setExcludeQuery] = React.useState("");
  const [excludeResults, setExcludeResults] = React.useState<DonorSearchResult[]>([]);
  const [excluded, setExcluded] = React.useState<DonorSearchResult[]>([]);

  React.useEffect(() => {
    fetch("/api/communication/audiences/facets", { cache: "no-store" })
      .then(json)
      .then((data) => setFacets({ countries: data.countries ?? [], projects: data.projects ?? [] }))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPreview(null);
    setPreviewError(null);
    onPreview?.(null);
    const timer = setTimeout(() => {
      fetch("/api/communication/audiences/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, definition: { ...value, channel } }),
        signal: controller.signal,
      })
        .then(json)
        .then((data) => {
          if (controller.signal.aborted) return;
          const next = data as SmartAudiencePreview;
          setPreview(next);
          onPreview?.(next);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPreview(null);
          setPreviewError(dt("تعذّر حساب الجمهور. أعد المحاولة؛ الأعداد غير متاحة وليست صفرًا."));
          onPreview?.(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [channel, value, onPreview, previewAttempt]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const q = excludeQuery.trim();
      if (q.length < 2) {
        setExcludeResults([]);
        return;
      }
      fetch(`/api/communication/audiences/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then(json)
        .then((data) => setExcludeResults(data.donors ?? []))
        .catch(() => setExcludeResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [excludeQuery]);

  const updateFilters = (patch: Partial<SmartAudienceDraft["filters"]>) =>
    onChange({ ...value, channel, filters: { ...value.filters, ...patch } });

  const setMany = (key: "countries" | "locales" | "projectIds" | "badgeIds", next: string[]) =>
    updateFilters({ [key]: next });

  const addExcluded = (donor: DonorSearchResult) => {
    if (value.excludeUserIds?.includes(donor.id)) return;
    setExcluded((current) => [...current, donor]);
    onChange({ ...value, channel, excludeUserIds: [...(value.excludeUserIds ?? []), donor.id] });
    setExcludeQuery("");
    setExcludeResults([]);
  };

  const removeExcluded = (id: string) => {
    setExcluded((current) => current.filter((d) => d.id !== id));
    onChange({ ...value, channel, excludeUserIds: (value.excludeUserIds ?? []).filter((x) => x !== id) });
  };

  const topLanguages = Object.entries(preview?.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const reviewCount = preview?.needsReview ?? 0;
  const contactRestrictions = (preview?.doNotContact ?? 0) + reviewCount;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        {previewError ? <Button type="button" variant="outline" onClick={() => setPreviewAttempt((attempt) => attempt + 1)} disabled={loading}>{dt("إعادة المحاولة")}</Button> : null}
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">{dt("من تريد أن تصل إليه الحملة؟")}</h3>
          <p className="mt-1 text-xs text-slate-500" role={previewError ? "alert" : undefined}>{previewError ?? dt("تُحفظ كل السجلات المطابقة كجمهور للحملة. تُراجع بيانات الاتصال وحالة إيقاف التواصل عند التنفيذ؛ الأهلية المبدئية ليست ضمانًا للتسليم.")}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-600">
            <span>{dt("استبعاد من وصلتهم رسائل تسويقية خلال")}</span>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={3650} step={1} value={value.filters.excludeMarketedWithinDays ?? ""} placeholder="0" aria-label={dt("عدد أيام استبعاد الرسائل التسويقية")} onChange={event => updateFilters({ excludeMarketedWithinDays: event.target.value ? Number(event.target.value) : null })} />
              <span>{dt("يوم")}</span>
            </div>
            <span className="block text-[11px]">{dt("عبر أي قناة. اتركها فارغة لإلغاء الاستبعاد؛ رسائل الإيصالات لا تُحتسب.")}</span>
          </label>
          <MultiPick label={dt("الدولة")} allLabel={dt("كل الدول")} selected={value.filters.countries ?? []} onChange={(next) => setMany("countries", next)}
            options={facets.countries.map((c) => ({ value: c.code, label: c.name, count: c.count }))} />

          <MultiPick label={dt("لغة المتبرع")} allLabel={dt("كل اللغات")} selected={value.filters.locales ?? []} onChange={(next) => setMany("locales", next)}
            options={SUPPORTED_LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))} />

          <label className="space-y-1 text-xs text-slate-600">
            <span>{dt("آخر تبرع")}</span>
            <select
              value={value.filters.donatedWithinDays ?? ""}
              onChange={(e) => updateFilters({ donatedWithinDays: e.target.value ? Number(e.target.value) : null })}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">{dt("في أي وقت")}</option>
              <option value="30">{dt("خلال آخر 30 يومًا")}</option>
              <option value="90">{dt("خلال آخر 90 يومًا")}</option>
              <option value="365">{dt("خلال آخر 365 يومًا")}</option>
              <option value="730">{dt("خلال آخر سنتين")}</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>{dt("لم يتبرع منذ")}</span>
            <select
              value={value.filters.notDonatedWithinDays ?? ""}
              onChange={(e) => updateFilters({ notDonatedWithinDays: e.target.value ? Number(e.target.value) : null })}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">{dt("بدون شرط")}</option>
              <option value="30">{dt("لم يتبرع آخر 30 يومًا")}</option>
              <option value="90">{dt("لم يتبرع آخر 90 يومًا")}</option>
              <option value="180">{dt("لم يتبرع آخر 180 يومًا")}</option>
              <option value="365">{dt("لم يتبرع آخر 365 يومًا")}</option>
            </select>
          </label>

          <MultiPick label={dt("تبرع لمشروع")} allLabel={dt("كل المشاريع")} selected={value.filters.projectIds ?? []} onChange={(next) => setMany("projectIds", next)}
            options={facets.projects.map((p) => ({ value: p.id, label: p.name }))} />

          <MultiPick label={dt("يحمل وساماً")} allLabel={dt("كل المتبرعين")} selected={value.filters.badgeIds ?? []} onChange={(next) => setMany("badgeIds", next)}
            options={badges} />

          <label className="space-y-1 text-xs text-slate-600">
            <span>{dt("الحد الأدنى للتبرع بالدولار")}</span>
            <Input
              type="number"
              min={0}
              value={value.filters.minDonationAmountUSD ?? ""}
              onChange={(e) => updateFilters({ minDonationAmountUSD: e.target.value ? Number(e.target.value) : null })}
              placeholder={dt("مثال: 100")}
            />
          </label>

          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-xs font-bold">{dt("الدورية في اختيار الجمهور")}</legend>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={value.filters.oneTimeOnly === true} onChange={event => updateFilters({ oneTimeOnly: event.target.checked, ...(event.target.checked ? { recurringOnly: false, recurringFrequencies: [] } : {}) })} />{dt("متبرعو المرة الواحدة فقط")}</label>
            {(["recurringFrequencies", "excludeRecurringFrequencies"] as const).map(key => <div key={key} className="grid gap-2"><b className="text-xs">{key === "recurringFrequencies" ? dt("تضمين اشتراكات نشطة") : dt("استثناء اشتراكات نشطة")}</b><div className="flex flex-wrap gap-3">{[["DAILY", dt("يومي")], ["MONTHLY", dt("شهري")], ["FRIDAY", dt("كل جمعة")]].map(([frequency, label]) => <label key={frequency} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={value.filters[key]?.includes(frequency) === true} onChange={event => updateFilters({ [key]: event.target.checked ? [...(value.filters[key] ?? []), frequency] : (value.filters[key] ?? []).filter(item => item !== frequency), ...(key === "recurringFrequencies" && event.target.checked ? { oneTimeOnly: false } : {}) })} />{label}</label>)}</div></div>)}
          </fieldset>

          <div className="space-y-2 pt-5">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={value.filters.recurringOnly === true}
                onChange={(e) => updateFilters({ recurringOnly: e.target.checked })}
              />
              {dt("متبرعون متكررون فقط")}</label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={value.filters.hasContact === true}
                onChange={(e) => updateFilters({ hasContact: e.target.checked })}
              />
              {dt("لديهم وسيلة اتصال للقناة فقط")}</label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-900">{dt("استثناءات")}</h3>
          <p className="mt-1 text-xs text-slate-500">{dt("ابحث عن شخص واستبعده بدل تحديد بقية الجمهور فردًا فردًا.")}</p>
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={excludeQuery} onChange={(e) => setExcludeQuery(e.target.value)} placeholder={dt("ابحث بالاسم أو الهاتف أو البريد")} className="ps-9" />
          {excludeResults.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {excludeResults.map((donor) => (
                <button key={donor.id} type="button" onClick={() => addExcluded(donor)} className="block w-full rounded px-3 py-2 text-start text-xs hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{donor.name ?? dt("بلا اسم")}</span>
                  <span className="ms-2 text-slate-500">{donor.phone ?? donor.email ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {excluded.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {excluded.map((donor) => (
              <span key={donor.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                {donor.name ?? donor.phone ?? donor.email ?? donor.id}
                <button type="button" onClick={() => removeExcluded(donor.id)}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-brand/20 bg-brand-50/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-slate-900">{dt("حجم الجمهور المتوقع")}</h3>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">{dt("جمهور الحملة")}</p><p className="mt-1 text-xl font-bold">{preview ? preview.matched.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">{dt("مؤهل مبدئيًا")}</p><p className="mt-1 text-xl font-bold text-emerald-700">{preview ? preview.eligible.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">{dt("بدون وسيلة اتصال")}</p><p className="mt-1 text-xl font-bold">{preview ? preview.missingContact.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3" title={preview ? dt("إيقاف التواصل: {0}؛ مراجعة بيانات الاتصال: {1}", [preview.doNotContact.toLocaleString("en-US"), reviewCount.toLocaleString("en-US")]) : undefined}><p className="text-[11px] text-slate-500">{dt("تواصل موقوف / يحتاج مراجعة")}</p><p className="mt-1 text-xl font-bold">{preview ? contactRestrictions.toLocaleString("en-US") : "—"}</p></div>
        </div>

        {topLanguages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {topLanguages.slice(0, 10).map(([locale, count]) => (
              <span key={locale} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
                {LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}: {count.toLocaleString("en-US")}
              </span>
            ))}
          </div>
        )}
      </section>

      {preview?.sample?.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{dt("عينة من الجمهور")}</h3>
              <p className="mt-1 text-xs text-slate-500">{dtx("تُحفظ كل السجلات المطابقة. إيقاف التواصل: {0}؛ مراجعة بيانات الاتصال: {1}. تُراجع الحالة مجددًا عند التنفيذ.", [preview.doNotContact.toLocaleString("en-US"), reviewCount.toLocaleString("en-US")])}</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-start text-xs">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">{dt("المتبرع")}</th><th className="p-2">{dt("اللغة")}</th><th className="p-2">{dt("الحالة")}</th></tr></thead>
              <tbody>
                {preview.sample.slice(0, 20).map((donor) => (
                  <tr key={donor.id} className="border-t border-slate-100">
                    <td className="p-2"><div className="font-medium">{donor.name ?? dt("بلا اسم")}</div><div className="text-[10px] text-slate-500">{channel === "EMAIL" ? donor.email : donor.phone}</div></td>
                    <td className="p-2">{LOCALE_LABELS[donor.locale as keyof typeof LOCALE_LABELS] ?? donor.locale}</td>
                    <td className="p-2">{donor.eligible ? <span className="text-emerald-700">{dt("مؤهل مبدئيًا")}</span> : <span className="text-amber-700">{donor.exclusionReason ? RECIPIENT_REASON_LABELS[donor.exclusionReason] : dt("تحتاج الحالة مراجعة")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
