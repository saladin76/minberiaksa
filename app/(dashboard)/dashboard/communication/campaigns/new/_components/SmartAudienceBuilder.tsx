"use client";

import * as React from "react";
import { Loader2, Search, X, Users, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/locales";
import { RECIPIENT_REASON_LABELS, type RecipientExclusionReason } from "@/lib/communication/campaign-audience-accounting";

export type SmartAudienceDraft = {
  version: 1;
  kind: "SMART";
  channel: "EMAIL" | "WHATSAPP" | "SMS";
  filters: {
    countries?: string[];
    locales?: string[];
    donatedWithinDays?: number | null;
    notDonatedWithinDays?: number | null;
    projectIds?: string[];
    badgeIds?: string[];
    recurringOnly?: boolean;
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

type DonorSearchResult = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

async function json(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || "تعذر تحميل البيانات");
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
  const [preview, setPreview] = React.useState<SmartAudiencePreview | null>(null);
  const [loading, setLoading] = React.useState(false);
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
          setPreviewError("تعذّر حساب الجمهور. أعد المحاولة؛ الأعداد غير متاحة وليست صفرًا.");
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
  }, [channel, value, onPreview]);

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

  const setSingle = (key: "countries" | "locales" | "projectIds", raw: string) =>
    updateFilters({ [key]: raw ? [raw] : [] });

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
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900">من تريد أن تصل إليه الحملة؟</h3>
          <p className="mt-1 text-xs text-slate-500" role={previewError ? "alert" : undefined}>{previewError ?? "تُحفظ كل السجلات المطابقة كجمهور للحملة. تُراجع بيانات الاتصال والموافقة عند التنفيذ؛ الأهلية المبدئية ليست ضمانًا للتسليم."}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-600">
            <span>الدولة</span>
            <select
              value={value.filters.countries?.[0] ?? ""}
              onChange={(e) => setSingle("countries", e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">كل الدول</option>
              {facets.countries.map((country) => (
                <option key={country.code} value={country.code}>{country.name} ({country.count})</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>لغة المتبرع</span>
            <select
              value={value.filters.locales?.[0] ?? ""}
              onChange={(e) => setSingle("locales", e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">كل اللغات</option>
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>{LOCALE_LABELS[locale]}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>آخر تبرع</span>
            <select
              value={value.filters.donatedWithinDays ?? ""}
              onChange={(e) => updateFilters({ donatedWithinDays: e.target.value ? Number(e.target.value) : null })}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">في أي وقت</option>
              <option value="30">خلال آخر 30 يومًا</option>
              <option value="90">خلال آخر 90 يومًا</option>
              <option value="365">خلال آخر 365 يومًا</option>
              <option value="730">خلال آخر سنتين</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>لم يتبرع منذ</span>
            <select
              value={value.filters.notDonatedWithinDays ?? ""}
              onChange={(e) => updateFilters({ notDonatedWithinDays: e.target.value ? Number(e.target.value) : null })}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">بدون شرط</option>
              <option value="30">لم يتبرع آخر 30 يومًا</option>
              <option value="90">لم يتبرع آخر 90 يومًا</option>
              <option value="180">لم يتبرع آخر 180 يومًا</option>
              <option value="365">لم يتبرع آخر 365 يومًا</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>تبرع لمشروع</span>
            <select
              value={value.filters.projectIds?.[0] ?? ""}
              onChange={(e) => setSingle("projectIds", e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">كل المشاريع</option>
              {facets.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-slate-600">
            <span>الحد الأدنى للتبرع بالدولار</span>
            <Input
              type="number"
              min={0}
              value={value.filters.minDonationAmountUSD ?? ""}
              onChange={(e) => updateFilters({ minDonationAmountUSD: e.target.value ? Number(e.target.value) : null })}
              placeholder="مثال: 100"
            />
          </label>

          <div className="space-y-2 pt-5">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={value.filters.recurringOnly === true}
                onChange={(e) => updateFilters({ recurringOnly: e.target.checked })}
              />
              متبرعون متكررون فقط
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={value.filters.hasContact === true}
                onChange={(e) => updateFilters({ hasContact: e.target.checked })}
              />
              لديهم وسيلة اتصال للقناة فقط
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-900">استثناءات</h3>
          <p className="mt-1 text-xs text-slate-500">ابحث عن شخص واستبعده بدل تحديد بقية الجمهور فردًا فردًا.</p>
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={excludeQuery} onChange={(e) => setExcludeQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف أو البريد" className="pr-9" />
          {excludeResults.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              {excludeResults.map((donor) => (
                <button key={donor.id} type="button" onClick={() => addExcluded(donor)} className="block w-full rounded px-3 py-2 text-right text-xs hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{donor.name ?? "بلا اسم"}</span>
                  <span className="mr-2 text-slate-500">{donor.phone ?? donor.email ?? ""}</span>
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
            <h3 className="text-sm font-semibold text-slate-900">حجم الجمهور المتوقع</h3>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">جمهور الحملة</p><p className="mt-1 text-xl font-bold">{preview ? preview.matched.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">مؤهل مبدئيًا</p><p className="mt-1 text-xl font-bold text-emerald-700">{preview ? preview.eligible.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-slate-500">بدون وسيلة اتصال</p><p className="mt-1 text-xl font-bold">{preview ? preview.missingContact.toLocaleString("en-US") : "—"}</p></div>
          <div className="rounded-lg bg-white p-3" title={preview ? `إيقاف التواصل: ${preview.doNotContact.toLocaleString("en-US")}؛ مراجعة الموافقة: ${reviewCount.toLocaleString("en-US")}` : undefined}><p className="text-[11px] text-slate-500">تواصل موقوف / يحتاج مراجعة</p><p className="mt-1 text-xl font-bold">{preview ? contactRestrictions.toLocaleString("en-US") : "—"}</p></div>
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
              <h3 className="text-sm font-semibold text-slate-900">عينة من الجمهور</h3>
              <p className="mt-1 text-xs text-slate-500">تُحفظ كل السجلات المطابقة. إيقاف التواصل: {preview.doNotContact.toLocaleString("en-US")}؛ مراجعة الموافقة: {reviewCount.toLocaleString("en-US")}. تُراجع الحالة مجددًا عند التنفيذ.</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">المتبرع</th><th className="p-2">اللغة</th><th className="p-2">الحالة</th></tr></thead>
              <tbody>
                {preview.sample.slice(0, 20).map((donor) => (
                  <tr key={donor.id} className="border-t border-slate-100">
                    <td className="p-2"><div className="font-medium">{donor.name ?? "بلا اسم"}</div><div className="text-[10px] text-slate-500">{channel === "EMAIL" ? donor.email : donor.phone}</div></td>
                    <td className="p-2">{LOCALE_LABELS[donor.locale as keyof typeof LOCALE_LABELS] ?? donor.locale}</td>
                    <td className="p-2">{donor.eligible ? <span className="text-emerald-700">مؤهل مبدئيًا</span> : <span className="text-amber-700">{donor.exclusionReason ? RECIPIENT_REASON_LABELS[donor.exclusionReason] : "تحتاج الحالة مراجعة"}</span>}</td>
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
