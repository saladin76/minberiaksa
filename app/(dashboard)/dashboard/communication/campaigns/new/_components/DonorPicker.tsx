"use client";

import * as React from "react";
import { toast } from "react-hot-toast";
import ReactCountryFlag from "react-country-flag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Users, Check, Loader2, TriangleAlert, ShieldQuestion, X } from "lucide-react";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@/lib/locales";
import {
  AgeFilterSelect,
  GenderFilterSelect,
  ageBracketBody,
  ageBracketLabel,
  applyAgeBracketParams,
  genderFilterLabel,
  type AgeBracket,
  type GenderFilterValue,
} from "@/components/dashboard/DemographicFilters";
import { cn } from "@/lib/utils";

export type Eligibility = "ELIGIBLE" | "NEEDS_REVIEW" | "UNAVAILABLE";

export interface DonorCandidate {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  image: string | null;
  locale: string;
  countryCode: string | null;
  countryName: string;
  badgeIds: string[];
  eligibility: Eligibility;
}

interface Facets {
  countries: { code: string; name: string; count: number }[];
  badges: { id: string; name: string; color: string }[];
}

const PAGE_SIZE = 25;

const ELIGIBILITY_META: Record<Eligibility, { label: string; tone: string; icon: typeof Check }> = {
  ELIGIBLE: { label: "يمكن مراسلته", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: Check },
  NEEDS_REVIEW: { label: "يحتاج موافقة", tone: "border-amber-200 bg-amber-50 text-amber-700", icon: ShieldQuestion },
  UNAVAILABLE: { label: "غير متاح", tone: "border-slate-200 bg-slate-100 text-slate-500", icon: TriangleAlert },
};

/**
 * Pick the donors a campaign goes to.
 *
 * Carries the same columns as المتبرعون — اللغة, الموقع, الشارات — so an audience is described here
 * the same way it is described there, and the segment someone has in mind ("Turkish donors with the
 * loyalty badge") can be expressed without leaving the wizard.
 *
 * The column المتبرعون does not have is eligibility, and it is the one that decides whether a
 * selection means anything: a donor with no phone is a fine donor and a dead SMS recipient. Every
 * row states its standing for *this campaign's channel*, and the contact shown is the one that
 * channel will actually use, so an email address never stands in for a missing phone number.
 *
 * Ineligible donors are shown and selectable rather than hidden. The send pipeline re-checks consent
 * at send time and records each one as a SKIPPED delivery with a reason, so filtering them out here
 * would only move the surprise later.
 */
export function DonorPicker({
  channel,
  selected,
  onChange,
}: {
  channel: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [donors, setDonors] = React.useState<DonorCandidate[]>([]);
  const [facets, setFacets] = React.useState<Facets>({ countries: [], badges: [] });
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [selectingAll, setSelectingAll] = React.useState(false);

  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [locale, setLocale] = React.useState("all");
  const [country, setCountry] = React.useState("all");
  const [badgeId, setBadgeId] = React.useState("all");
  const [eligibility, setEligibility] = React.useState("all");
  const [gender, setGender] = React.useState<GenderFilterValue>("all");
  const [ageBracket, setAgeBracket] = React.useState<AgeBracket>("all");

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(1);
  }, [search, locale, country, badgeId, eligibility, gender, ageBracket]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ channel, page: String(page), limit: String(PAGE_SIZE), eligibility });
    if (search) params.set("search", search);
    if (locale !== "all") params.set("locale", locale);
    if (country !== "all") params.set("country", country);
    if (badgeId !== "all") params.set("badgeId", badgeId);
    if (gender !== "all") params.set("gender", gender);
    applyAgeBracketParams(params, ageBracket);

    fetch(`/api/communication/audience-candidates?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "تعذّر تحميل المتبرعين");
        setDonors(j.donors ?? []);
        setTotal(j.pagination?.total ?? 0);
        if (j.facets) setFacets(j.facets);
      })
      .catch((e) => !cancelled && toast.error((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [channel, page, search, locale, country, badgeId, eligibility, gender, ageBracket]);

  const badgeById = React.useMemo(
    () => new Map(facets.badges.map((b) => [b.id, b])),
    [facets.badges],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const pageIds = donors.map((d) => d.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    const next = new Set(selected);
    for (const id of pageIds) {
      if (allPageSelected) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  };

  /** Selects everything the current filter matches, not merely the visible page. */
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const res = await fetch("/api/communication/audience-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          search,
          locale,
          country,
          badgeId,
          eligibility,
          ...(gender !== "all" ? { gender } : {}),
          ...ageBracketBody(ageBracket),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "تعذّر التحديد");
      onChange(new Set([...selected, ...json.ids]));
      if (json.truncated) toast("اكتفينا بأول ٥٠٠٠ متبرع مطابق.", { icon: "ℹ️" });
      else toast.success(`تم تحديد ${json.ids.length} متبرعًا`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSelectingAll(false);
    }
  };

  const activeFilters = [
    search && { key: "s", label: `بحث: ${search}`, clear: () => setSearchInput("") },
    locale !== "all" && { key: "l", label: `اللغة: ${LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}`, clear: () => setLocale("all") },
    country !== "all" && { key: "c", label: `الموقع: ${facets.countries.find((c) => c.code === country)?.name ?? country}`, clear: () => setCountry("all") },
    badgeId !== "all" && { key: "b", label: `الشارة: ${badgeById.get(badgeId)?.name ?? badgeId}`, clear: () => setBadgeId("all") },
    eligibility !== "all" && { key: "e", label: eligibility === "eligible" ? "المتاحون فقط" : "غير المتاحين فقط", clear: () => setEligibility("all") },
    gender !== "all" && { key: "g", label: `الجنس: ${genderFilterLabel(gender)}`, clear: () => setGender("all") },
    ageBracket !== "all" && { key: "a", label: `العمر: ${ageBracketLabel(ageBracket)}`, clear: () => setAgeBracket("all") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const resetAll = () => {
    setSearchInput("");
    setLocale("all");
    setCountry("all");
    setBadgeId("all");
    setEligibility("all");
    setGender("all");
    setAgeBracket("all");
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const triggerCls = "h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[9rem]";

  return (
    <div>
      <FilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="ابحث بالاسم أو البريد أو الهاتف…"
        actions={
          <Button variant="outline" size="sm" onClick={selectAllMatching} disabled={selectingAll || loading} className="gap-1.5">
            {selectingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            تحديد كل النتائج
          </Button>
        }
      >
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger aria-label="تصفية باللغة" className={triggerCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل اللغات</SelectItem>
            {SUPPORTED_LOCALES.map((l) => (
              <SelectItem key={l} value={l} className="text-xs">{LOCALE_LABELS[l]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Countries are ordered by donor count, not alphabetically — with 70+ present, the five
            that matter would otherwise be buried mid-list. */}
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger aria-label="تصفية بالموقع" className={triggerCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all" className="text-xs">كل المواقع</SelectItem>
            {facets.countries.map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-xs">
                {c.name} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={badgeId} onValueChange={setBadgeId}>
          <SelectTrigger aria-label="تصفية بالشارة" className={triggerCls}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل الشارات</SelectItem>
            {facets.badges.map((b) => (
              <SelectItem key={b.id} value={b.id} className="text-xs">
                <span className="me-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <GenderFilterSelect value={gender} onChange={setGender} className={triggerCls} />

        <AgeFilterSelect value={ageBracket} onChange={setAgeBracket} className={triggerCls} />

        <Select value={eligibility} onValueChange={setEligibility}>
          <SelectTrigger aria-label="تصفية بالأهلية" className={cn(triggerCls, "sm:basis-[10rem]")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل الأهليات</SelectItem>
            <SelectItem value="eligible" className="text-xs">يمكن مراسلته فقط</SelectItem>
            <SelectItem value="ineligible" className="text-xs">غير المتاحين فقط</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {activeFilters.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={f.clear}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700 hover:bg-brand-100"
            >
              <span className="truncate">{f.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          <button type="button" onClick={resetAll} className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-800">
            مسح الكل
          </button>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={togglePage}
          disabled={pageIds.length === 0}
          className="text-[11px] font-medium text-brand underline underline-offset-2 disabled:opacity-40"
        >
          {allPageSelected ? "إلغاء تحديد هذه الصفحة" : "تحديد هذه الصفحة"}
        </button>
        <span className="text-[11px] text-slate-500">
          {total.toLocaleString("en-US")} متبرع مطابق · محدَّد {selected.size.toLocaleString("en-US")}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : donors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد متبرع مطابق"
          description="جرّب توسيع التصفية أو مسحها."
          action={
            activeFilters.length > 0 ? (
              <Button variant="outline" size="sm" onClick={resetAll}>مسح التصفية</Button>
            ) : undefined
          }
        />
      ) : (
        /* The scroll lives on this box, not the page: a wide table must never make the whole
           wizard slide sideways. */
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    aria-label="تحديد كل الصفحة"
                    className="h-4 w-4 accent-brand"
                  />
                </th>
                <th className="min-w-[190px] px-3 py-2.5 text-right text-xs font-semibold">المتبرع</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold">اللغة</th>
                <th className="min-w-[130px] px-3 py-2.5 text-right text-xs font-semibold">الموقع</th>
                <th className="min-w-[130px] px-3 py-2.5 text-right text-xs font-semibold">الشارات</th>
                <th className="min-w-[110px] px-3 py-2.5 text-right text-xs font-semibold">الأهلية</th>
              </tr>
            </thead>
            <tbody>
              {donors.map((d) => {
                const on = selected.has(d.id);
                const meta = ELIGIBILITY_META[d.eligibility];
                const EIcon = meta.icon;
                return (
                  <tr
                    key={d.id}
                    onClick={() => toggle(d.id)}
                    className={cn(
                      "cursor-pointer border-b border-slate-100 transition-colors last:border-0",
                      on ? "bg-brand-50" : "hover:bg-slate-50/70",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(d.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`تحديد ${d.name ?? "متبرع"}`}
                        className="h-4 w-4 accent-brand"
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 shrink-0 rounded-full ring-1 ring-slate-200">
                          <AvatarImage src={d.image ?? undefined} alt="" />
                          <AvatarFallback className="rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-[10px] font-bold text-white">
                            {(d.name ?? d.email ?? "؟").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-900">{d.name ?? "بلا اسم"}</p>
                          {/* The contact THIS channel uses — an email under an SMS campaign would
                              misrepresent where the message actually goes. */}
                          <p className="truncate text-[11px] text-slate-500">
                            {channel === "EMAIL" ? d.email ?? "بلا بريد" : d.phone ?? "بلا رقم"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">
                        {LOCALE_LABELS[d.locale as keyof typeof LOCALE_LABELS] ?? d.locale}
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-[12px] text-slate-700">
                        {d.countryCode ? (
                          <ReactCountryFlag countryCode={d.countryCode} svg style={{ width: "1.1em", height: "1.1em" }} title={d.countryCode} />
                        ) : null}
                        <span className="truncate">{d.countryName}</span>
                      </span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {d.badgeIds.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
                        {d.badgeIds.map((bid) => {
                          const b = badgeById.get(bid);
                          if (!b) return null;
                          return (
                            <span
                              key={bid}
                              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                              style={{ borderColor: `${b.color}55`, backgroundColor: `${b.color}14`, color: b.color }}
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color }} />
                              {b.name}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap", meta.tone)}>
                        <EIcon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-[11px] tabular-nums text-slate-500">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
