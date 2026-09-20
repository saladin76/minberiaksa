"use client";

import * as React from "react";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownWideNarrow, Loader2, Receipt, RefreshCw, X, Hourglass, CheckCircle2, Ban, Inbox } from "lucide-react";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { MetricSummaryBand } from "@/components/dashboard/MetricSummaryBand";
import { cn } from "@/lib/utils";
import { emitTransferReceiptsPending } from "@/lib/donations/transfer-receipts-badge";
import type { AdminClaimView } from "@/lib/donations/bank-transfer-serializers";
import { CLAIM_STATUS_LABELS, type ClaimStatus } from "./status";
import { TransferReceiptCard } from "./TransferReceiptCard";
import { TransferReceiptDialog, type ReviewAction } from "./TransferReceiptDialog";

const PAGE_SIZE = 24;

type StatusFilter = "all" | ClaimStatus;
type SortValue = "priority" | "newest" | "oldest" | "amountDesc" | "amountAsc";
type Counts = Record<StatusFilter, number>;

const EMPTY_COUNTS: Counts = { all: 0, UNDER_REVIEW: 0, AWAITING_RECEIPT: 0, REJECTED: 0, CONFIRMED: 0 };

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "UNDER_REVIEW", label: CLAIM_STATUS_LABELS.UNDER_REVIEW },
  { value: "AWAITING_RECEIPT", label: CLAIM_STATUS_LABELS.AWAITING_RECEIPT },
  { value: "REJECTED", label: CLAIM_STATUS_LABELS.REJECTED },
  { value: "CONFIRMED", label: CLAIM_STATUS_LABELS.CONFIRMED },
  { value: "all", label: "الكل" },
];

const DEFAULTS = { status: "UNDER_REVIEW" as StatusFilter, currency: "all", bank: "all", sort: "priority" as SortValue, from: "", to: "" };

function FilterSelect({ value, onValueChange, label, children, className }: { value: string; onValueChange: (v: string) => void; label: string; children: React.ReactNode; className?: string }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className={cn("h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[9.5rem]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * The finance queue for donor-uploaded bank transfer receipts.
 *
 * Opens on "بانتظار المراجعة" because that is the tab with work in it; the
 * others are there to look something up. A Telegram card or an email links
 * straight to one claim with `?claim=`, which opens the dialog on load.
 */
export function TransferReceiptsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedClaim = searchParams.get("claim");

  const [claims, setClaims] = React.useState<AdminClaimView[]>([]);
  const [counts, setCounts] = React.useState<Counts>(EMPTY_COUNTS);
  const [usdByStatus, setUsdByStatus] = React.useState<Record<string, number>>({});
  const [banks, setBanks] = React.useState<{ slug: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);

  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>(DEFAULTS.status);
  const [currency, setCurrency] = React.useState(DEFAULTS.currency);
  const [bank, setBank] = React.useState(DEFAULTS.bank);
  const [sort, setSort] = React.useState<SortValue>(DEFAULTS.sort);
  const [from, setFrom] = React.useState(DEFAULTS.from);
  const [to, setTo] = React.useState(DEFAULTS.to);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /* A deep link may point at a claim outside the current page; it is fetched on its own. */
  const [extraClaim, setExtraClaim] = React.useState<AdminClaimView | null>(null);

  const selected = React.useMemo(
    () => claims.find((c) => c.id === selectedId) ?? (extraClaim?.id === selectedId ? extraClaim : null),
    [claims, extraClaim, selectedId],
  );

  const fetchClaims = React.useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE), sort });
        if (search) params.set("q", search);
        if (status !== "all") params.set("status", status);
        if (currency !== "all") params.set("currency", currency);
        if (bank !== "all") params.set("bank", bank);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const res = await axios.get(`/api/admin/transfer-receipts?${params}`);
        const list: AdminClaimView[] = res.data?.claims ?? [];
        setClaims((prev) => (append ? [...prev, ...list] : list));
        setTotal(res.data?.pagination?.total ?? 0);
        setCounts({ ...EMPTY_COUNTS, ...(res.data?.counts ?? {}) });
        setUsdByStatus(res.data?.usdByStatus ?? {});
        setBanks(res.data?.banks ?? []);
        if (typeof res.data?.counts?.UNDER_REVIEW === "number") emitTransferReceiptsPending({ count: res.data.counts.UNDER_REVIEW });
      } catch (err) {
        console.error("Error fetching transfer receipts:", err);
        toast.error("فشل تحميل إيصالات التحويل");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, status, currency, bank, sort, from, to],
  );

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    setPage(1);
    fetchClaims(1, false);
  }, [fetchClaims]);

  /* `?claim=` from a Telegram card: open it whatever tab it would be under. */
  React.useEffect(() => {
    if (!deepLinkedClaim) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/api/admin/transfer-receipts/${deepLinkedClaim}`);
        if (cancelled || !res.data?.claim) return;
        setExtraClaim(res.data.claim);
        setSelectedId(res.data.claim.id);
      } catch {
        if (!cancelled) toast.error("لم يُعثر على هذا الإيصال");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkedClaim]);

  const closeDialog = React.useCallback(() => {
    setSelectedId(null);
    if (deepLinkedClaim) router.replace("/dashboard/transfer-receipts");
  }, [deepLinkedClaim, router]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchClaims(next, true);
  };
  const hasMore = claims.length < total;

  /**
   * Apply a decision and reconcile the row, the tab counts and the sidebar badge. The row keeps
   * its slot with its new status rather than vanishing from under the reviewer; the next fetch
   * moves it to the right tab.
   */
  const review = React.useCallback(
    async (id: string, input: ReviewAction) => {
      const before = claims.find((c) => c.id === id) ?? (extraClaim?.id === id ? extraClaim : null);
      try {
        const res = await axios.patch(`/api/admin/transfer-receipts/${id}`, input);
        const updated: AdminClaimView | undefined = res.data?.claim;
        if (!updated) return;
        setClaims((prev) => prev.map((c) => (c.id === id ? updated : c)));
        if (extraClaim?.id === id) setExtraClaim(updated);
        if (before && before.status !== updated.status) {
          setCounts((prev) => ({ ...prev, [before.status]: Math.max(0, prev[before.status] - 1), [updated.status]: prev[updated.status] + 1 }));
          const delta = (updated.status === "UNDER_REVIEW" ? 1 : 0) - (before.status === "UNDER_REVIEW" ? 1 : 0);
          if (delta) emitTransferReceiptsPending({ delta });
        }
        if (input.action === "confirm") toast.success("تم تأكيد التحويل واحتساب التبرع");
        else if (input.action === "reject") toast.success("تم رفض الإيصال وإبلاغ المتبرع");
        else toast.success("تم حفظ الملاحظة");
      } catch (err) {
        const code = axios.isAxiosError(err) ? err.response?.data?.error : null;
        toast.error(code === "ALREADY_CONFIRMED" ? "هذا التحويل مؤكد بالفعل" : code === "REASON_REQUIRED" ? "اكتب سبب الرفض" : "تعذّر تنفيذ الإجراء");
        throw err;
      }
    },
    [claims, extraClaim],
  );

  const activeFilters = [
    search && { key: "search", label: `بحث: ${search}`, clear: () => setSearchInput("") },
    currency !== "all" && { key: "currency", label: `العملة: ${currency}`, clear: () => setCurrency("all") },
    bank !== "all" && { key: "bank", label: `البنك: ${banks.find((b) => b.slug === bank)?.name ?? bank}`, clear: () => setBank("all") },
    (from || to) && { key: "dates", label: `التاريخ: ${from || "…"} → ${to || "…"}`, clear: () => { setFrom(""); setTo(""); } },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const resetAll = () => {
    setSearchInput("");
    setStatus(DEFAULTS.status);
    setCurrency(DEFAULTS.currency);
    setBank(DEFAULTS.bank);
    setSort(DEFAULTS.sort);
    setFrom(DEFAULTS.from);
    setTo(DEFAULTS.to);
  };

  const currencies = React.useMemo(() => Array.from(new Set(claims.map((c) => c.donation.currency))).sort(), [claims]);
  const fmtUsd = (n: number | undefined) => `$${Math.round(n ?? 0).toLocaleString("en")}`;

  return (
    <div dir="rtl">
      <MetricSummaryBand
        eyebrow="بانتظار قرار مالي"
        value={String(counts.UNDER_REVIEW)}
        badge="إيصالات مرفوعة"
        note="إيصالات رفعها المتبرعون ولم تُطابَق بعد. لا تُحتسب في الإيرادات حتى تأكيدها."
        icon={Hourglass}
        stats={[
          { label: "قيمة ما ينتظر المراجعة", value: fmtUsd(usdByStatus.UNDER_REVIEW), icon: Receipt, hint: "USD" },
          { label: "بانتظار الإيصال", value: String(counts.AWAITING_RECEIPT), icon: Inbox },
          { label: "مؤكدة", value: String(counts.CONFIRMED), icon: CheckCircle2, hint: fmtUsd(usdByStatus.CONFIRMED) },
          { label: "مرفوضة", value: String(counts.REJECTED), icon: Ban },
        ]}
        className="mb-4"
      />

      <div role="tablist" aria-label="حالة الإيصال" className="mb-3 flex w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          const count = counts[tab.value];
          const urgent = tab.value === "UNDER_REVIEW" && count > 0;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {tab.label}
              <span className={cn("inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums", active ? "bg-white/25 text-white" : urgent ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <FilterBar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="اسم المتبرع، البريد، الهاتف، المرجع أو رقم الطلب…"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fetchClaims(1, false)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="hidden sm:inline">تحديث</span>
          </Button>
        }
      >
        <FilterSelect value={currency} onValueChange={setCurrency} label="تصفية بالعملة">
          <SelectItem value="all" className="text-xs">كل العملات</SelectItem>
          {currencies.map((c) => (
            <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect value={bank} onValueChange={setBank} label="تصفية بالبنك">
          <SelectItem value="all" className="text-xs">كل البنوك</SelectItem>
          {banks.map((b) => (
            <SelectItem key={b.slug} value={b.slug} className="text-xs">{b.name}</SelectItem>
          ))}
        </FilterSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" className="h-9 flex-1 rounded-lg border-slate-200 bg-slate-50 text-xs sm:flex-none sm:basis-[9rem]" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" className="h-9 flex-1 rounded-lg border-slate-200 bg-slate-50 text-xs sm:flex-none sm:basis-[9rem]" />
        <FilterSelect value={sort} onValueChange={(v) => setSort(v as SortValue)} label="الترتيب" className="sm:basis-[12rem]">
          <SelectItem value="priority" className="text-xs">الأولوية: الأطول انتظارًا</SelectItem>
          <SelectItem value="newest" className="text-xs">الأحدث أولًا</SelectItem>
          <SelectItem value="oldest" className="text-xs">الأقدم أولًا</SelectItem>
          <SelectItem value="amountDesc" className="text-xs">الأعلى مبلغًا</SelectItem>
          <SelectItem value="amountAsc" className="text-xs">الأقل مبلغًا</SelectItem>
        </FilterSelect>
      </FilterBar>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">التصفية النشطة:</span>
          {activeFilters.map((f) => (
            <button key={f.key} type="button" onClick={f.clear} className="inline-flex max-w-full items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700 transition-colors hover:bg-brand-100">
              <span className="truncate">{f.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          <button type="button" onClick={resetAll} className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-800">مسح الكل</button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          {loading ? "جاري التحميل…" : `${total} إيصال`}
        </h2>
        {!loading && claims.length > 0 && <span className="text-[11px] text-slate-400">معروض {claims.length} من {total}</span>}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : claims.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            status === "UNDER_REVIEW"
              ? "لا شيء بانتظار المراجعة — كل الإيصالات تمت معالجتها"
              : status === "AWAITING_RECEIPT"
                ? "لا توجد طلبات بانتظار إيصال"
                : status === "REJECTED"
                  ? "لا توجد إيصالات مرفوضة"
                  : status === "CONFIRMED"
                    ? "لم يُؤكَّد أي تحويل بعد"
                    : activeFilters.length > 0
                      ? "لا توجد إيصالات مطابقة"
                      : "لا توجد تحويلات بنكية بعد"
          }
          description={
            activeFilters.length > 0 || status !== "all"
              ? "جرّب تبويبًا آخر أو وسّع التصفية لعرض كل الإيصالات."
              : "عندما يختار متبرع «التحويل البنكي» عند الدفع ويرفع إيصاله، يظهر هنا لمطابقته مع كشف الحساب."
          }
          action={activeFilters.length > 0 || status !== "all" ? <Button variant="outline" size="sm" onClick={() => { resetAll(); setStatus("all"); }}>عرض كل الإيصالات</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {claims.map((c) => (
              <TransferReceiptCard key={c.id} claim={c} onOpen={() => setSelectedId(c.id)} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-5 text-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="gap-2">
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                تحميل المزيد
              </Button>
            </div>
          )}
        </>
      )}

      <TransferReceiptDialog claim={selected} onClose={closeDialog} onReview={review} />
    </div>
  );
}
