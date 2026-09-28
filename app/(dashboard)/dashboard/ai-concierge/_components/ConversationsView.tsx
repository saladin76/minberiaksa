"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Bot, ChevronLeft, ChevronRight, Download, HandCoins, Loader2, MessagesSquare, Search, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { cn } from "@/lib/utils";
import { DEFAULT_PERIOD, PeriodPicker, periodParams, type Period } from "./PeriodPicker";
import { ConversationSheet } from "./ConversationSheet";
import { INTENT_LABELS, LOCALE_LABELS, ROUTE_LABELS, dateTime, label, num, usd } from "./labels";

type Item = {
  id: string;
  sessionId: string;
  locale: string;
  user: { id: string; name: string | null; email: string | null } | null;
  firstRoute: string | null;
  turnCount: number;
  userMessageCount: number;
  intents: string[];
  needsHuman: boolean;
  fallbackCount: number;
  startedAt: string;
  lastMessageAt: string;
  preview: string | null;
  lastReply: string | null;
  donation: { kind: "direct" | "indirect"; count: number; usd: number } | null;
};

const ANY = "__any";

/** Filters that live in the URL, so a filtered list can be shared or bookmarked. */
const FLAG_FILTERS: Array<{ key: string; label: string }> = [
  { key: "typedOnly", label: "كتب رسالة" },
  { key: "needsHuman", label: "تحتاج متابعة" },
  { key: "fallback", label: "أجاب بدون النموذج" },
  { key: "signedIn", label: "متبرع مسجّل" },
];

export function ConversationsView() {
  const router = useRouter();
  const search = useSearchParams();
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [q, setQ] = useState(search.get("q") ?? "");
  const [data, setData] = useState<{ total: number; page: number; pageSize: number; items: Item[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const openId = search.get("id");
  const page = Math.max(1, Number(search.get("page") ?? 1) || 1);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch) && !("id" in patch)) next.delete("page");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, search]
  );

  const query = useMemo(() => {
    const p = periodParams(period);
    for (const k of ["locale", "intent", "outcome", "q", ...FLAG_FILTERS.map((f) => f.key)]) {
      const v = search.get(k);
      if (v) p.set(k, v);
    }
    p.set("page", String(page));
    p.set("pageSize", "25");
    return p;
  }, [period, search, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/ai/concierge/conversations?${query}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error || "تعذّر التحميل");
        return json;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "تعذّر التحميل"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  /* Debounced free-text search. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((search.get("q") ?? "") !== q.trim()) setParam({ q: q.trim() || null });
    }, 400);
    return () => window.clearTimeout(t);
  }, [q, search, setParam]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const csvHref = useMemo(() => {
    const p = new URLSearchParams(query);
    p.delete("page");
    p.delete("pageSize");
    p.set("format", "csv");
    return `/api/admin/ai/concierge/conversations?${p}`;
  }, [query]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث داخل نص المحادثات…" className="h-9 bg-white ps-9 text-[13px]" />
          </div>
          <FilterSelect value={search.get("outcome")} onChange={(v) => setParam({ outcome: v })} placeholder="كل النتائج" options={[{ value: "donated", label: "انتهت بتبرع" }, { value: "direct", label: "تبرع مباشر" }, { value: "none", label: "بدون تبرع" }]} />
          <FilterSelect value={search.get("intent")} onChange={(v) => setParam({ intent: v })} placeholder="كل النوايا" options={Object.entries(INTENT_LABELS).map(([value, l]) => ({ value, label: l }))} />
          <FilterSelect value={search.get("locale")} onChange={(v) => setParam({ locale: v })} placeholder="كل اللغات" options={Object.entries(LOCALE_LABELS).map(([value, l]) => ({ value, label: l }))} />
          <a href={csvHref} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> تصدير CSV
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FLAG_FILTERS.map((f) => {
            const on = search.get(f.key) === "1";
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setParam({ [f.key]: on ? null : "1" })}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition-colors",
                  on ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {f.label}
                {on && <X className="h-3 w-3" />}
              </button>
            );
          })}
          <span className="ms-auto text-xs text-slate-500">
            {loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : data ? `${num(data.total)} محادثة` : null}
          </span>
        </div>
      </section>

      {error && <EmptyState icon={AlertTriangle} title="تعذّر تحميل المحادثات" description={error} />}

      {data && data.items.length === 0 && !loading && (
        <EmptyState icon={MessagesSquare} title="لا محادثات تطابق التصفية" description="غيّر الفترة أو أزل بعض عوامل التصفية." />
      )}

      {data && data.items.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {data.items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => setParam({ id: it.id })} className={cn("w-full px-4 py-3.5 text-start transition-colors hover:bg-slate-50", openId === it.id && "bg-brand-50/60")}>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      {it.user?.name || it.user?.email || "زائر"}
                    </span>
                    <span>·</span>
                    <span>{dateTime(it.lastMessageAt)}</span>
                    <span>·</span>
                    <span>{label(LOCALE_LABELS, it.locale)}</span>
                    {it.firstRoute && (
                      <>
                        <span>·</span>
                        <span>من {label(ROUTE_LABELS, it.firstRoute)}</span>
                      </>
                    )}
                    <span className="ms-auto flex flex-wrap items-center gap-1.5">
                      {it.donation && (
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", it.donation.kind === "direct" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700")}>
                          <HandCoins className="h-3 w-3" />
                          {it.donation.kind === "direct" ? "تبرع مباشر" : "تبرع غير مباشر"} {usd(it.donation.usd)}
                        </span>
                      )}
                      {it.needsHuman && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">تحتاج متابعة</span>}
                      {it.fallbackCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <Bot className="h-3 w-3" /> {it.fallbackCount} بدون النموذج
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-1 text-[14px] font-medium text-slate-900">{it.preview ?? <span className="text-slate-400">لم يكتب الزائر رسالة — تنقّل بالأزرار فقط</span>}</p>
                  {it.lastReply && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500">المساعد: {it.lastReply}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {it.intents.map((i) => (
                      <span key={i} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {label(INTENT_LABELS, i)}
                      </span>
                    ))}
                    <span className="text-[11px] text-slate-400">{num(it.userMessageCount)} رسالة من الزائر · {num(it.turnCount)} دور</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>
              صفحة {num(page)} من {num(pages)}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
                <ChevronRight className="h-4 w-4" /> السابق
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      <ConversationSheet
        id={openId}
        onClose={() => setParam({ id: null })}
        onDeleted={() => {
          setParam({ id: null });
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; options: Array<{ value: string; label: string }> }) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)} dir="rtl">
      <SelectTrigger className="h-9 w-[150px] bg-white text-[13px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} className="text-[13px]">
          {placeholder}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[13px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
