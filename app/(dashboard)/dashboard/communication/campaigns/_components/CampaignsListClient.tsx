"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Megaphone, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignsTable, sortCampaigns, type CampaignSort } from "./CampaignsTable";
import { type CampaignRow, CHANNEL_META, STATUS_META } from "./campaign-ui";

export function CampaignsListClient() {
  const [campaigns, setCampaigns] = React.useState<CampaignRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [channel, setChannel] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  // Newest first: the campaign someone came here to check is almost always the one just sent.
  const [sort, setSort] = React.useState<CampaignSort>({ key: "date", dir: "desc" });

  // Re-clicking the active column flips direction; a new column starts descending, which is the
  // useful default for every column here (most recent, most sent, most failed).
  const toggleSort = React.useCallback((key: CampaignSort["key"]) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/communication/campaigns", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "تعذّر تحميل الحملات");
      setCampaigns(json.campaigns ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Filtered and sorted client-side: the service caps the list at 200 rows, so this is a small
  // in-memory set and a round trip per keystroke or column click would buy nothing.
  const filtered = sortCampaigns(
    campaigns.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (status !== "all" && c.status !== status) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    sort,
  );

  const byChannel = (id: string) => campaigns.filter((c) => c.channel === id).length;

  return (
    <div dir="rtl">
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ابحث باسم الحملة…"
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
            <Button size="sm" className="gap-1.5 bg-brand hover:bg-brand/90" asChild>
              <Link href="/dashboard/communication/campaigns/new">
                <Plus className="h-4 w-4" />
                حملة جديدة
              </Link>
            </Button>
          </>
        }
      >
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger aria-label="تصفية بالقناة" className="h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل القنوات</SelectItem>
            {Object.entries(CHANNEL_META).map(([id, m]) => (
              <SelectItem key={id} value={id} className="text-xs">
                {m.label} ({byChannel(id)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="تصفية بالحالة" className="h-9 min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs sm:flex-none sm:basis-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">كل الحالات</SelectItem>
            {Object.entries(STATUS_META).map(([id, m]) => (
              <SelectItem key={id} value={id} className="text-xs">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {loading ? (
        // Shaped like the table it replaces, so the layout does not jump when rows arrive.
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-10 border-b border-slate-100 bg-slate-50/90" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-3 py-3 last:border-0">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-slate-100" />
              <div className="hidden h-3.5 w-24 animate-pulse rounded bg-slate-100 sm:block" />
              <div className="hidden h-3.5 w-16 animate-pulse rounded bg-slate-100 md:block" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={campaigns.length === 0 ? "لا توجد حملات تسويقية بعد" : "لا توجد حملة مطابقة"}
          description={
            campaigns.length === 0
              ? "الحملة ترسل قالبًا واحدًا لمجموعة متبرعين تختارها — كلٌّ بلغته المفضّلة. ابدأ باختيار القناة."
              : "جرّب توسيع التصفية أو مسحها."
          }
          action={
            campaigns.length === 0 ? (
              <Button className="gap-1.5 bg-brand hover:bg-brand/90" asChild>
                <Link href="/dashboard/communication/campaigns/new">
                  <Plus className="h-4 w-4" />
                  إنشاء أول حملة
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setChannel("all");
                  setStatus("all");
                }}
              >
                مسح التصفية
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {filtered.length} حملة
            {filtered.length !== campaigns.length && (
              <span className="font-normal normal-case tracking-normal text-slate-400"> من {campaigns.length}</span>
            )}
          </p>
          <CampaignsTable campaigns={filtered} sort={sort} onSort={toggleSort} onChanged={load} />
        </>
      )}
    </div>
  );
}
