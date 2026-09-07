"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALE_LABELS } from "@/lib/locales";
import { type CampaignRow, channelMeta, statusMeta, hasResults, audienceLabel } from "./campaign-ui";
import { CampaignRowActions } from "./CampaignRowActions";

/**
 * The campaign list as a table.
 *
 * This replaced a card grid, and the reason is the numbers: أُرسلت / وصلت / فشلت were three stats
 * buried inside each card, so comparing two campaigns meant reading two cards in full. In columns
 * they line up, right-aligned and tabular, and a campaign that failed is visible without reading
 * anything. Sorting only makes sense once they are columns, which is the other half of the move.
 */

type SortKey = "name" | "channel" | "status" | "sentCount" | "deliveredCount" | "failedCount" | "date";
type SortDir = "asc" | "desc";
export type CampaignSort = { key: SortKey; dir: SortDir };

/** Scheduled campaigns are read against their send date; everything else against its last change. */
function rowDate(c: CampaignRow): { iso: string; label: string; caption: string } {
  const iso = c.scheduledAt ?? c.updatedAt;
  return {
    iso,
    label: new Date(iso).toLocaleDateString("ar-EG", { dateStyle: "medium" }),
    caption: c.scheduledAt ? "موعد الإرسال" : "آخر تحديث",
  };
}

export function sortCampaigns(rows: CampaignRow[], sort: CampaignSort): CampaignRow[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  // Sort a copy: the caller's array is derived from state and must not be mutated in render.
  return [...rows].sort((a, b) => {
    switch (sort.key) {
      case "name":
        return a.name.localeCompare(b.name, "ar") * factor;
      case "channel":
        return channelMeta(a.channel).label.localeCompare(channelMeta(b.channel).label, "ar") * factor;
      case "status":
        return statusMeta(a.status).label.localeCompare(statusMeta(b.status).label, "ar") * factor;
      case "date":
        return (new Date(rowDate(a).iso).getTime() - new Date(rowDate(b).iso).getTime()) * factor;
      default:
        return (a[sort.key] - b[sort.key]) * factor;
    }
  });
}

function SortHeader({
  label, sortKey, sort, onSort, align = "right", className,
}: {
  label: string;
  sortKey: SortKey;
  sort: CampaignSort;
  onSort: (key: SortKey) => void;
  align?: "right" | "left";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`ترتيب حسب ${label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          align === "left" ? "flex-row-reverse" : "",
          active && "text-slate-900",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
}

/** A count cell. Campaigns that never went out show a dash — a column of zeros reads as broken. */
function CountCell({ value, show, tone }: { value: number; show: boolean; tone?: string }) {
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-left align-middle tabular-nums">
      {!show ? (
        <span className="text-slate-300">—</span>
      ) : (
        <span className={cn("font-semibold", value === 0 ? "text-slate-400" : tone ?? "text-slate-900")}>
          {value.toLocaleString("en-US")}
        </span>
      )}
    </td>
  );
}

export function CampaignsTable({
  campaigns, sort, onSort, onChanged,
}: {
  campaigns: CampaignRow[];
  sort: CampaignSort;
  onSort: (key: SortKey) => void;
  /** Re-fetch the list after a row action changes a campaign's status. */
  onChanged: () => void;
}) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Wide content scrolls inside its own container so the page body never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            {/* Sticky so the numeric columns stay labelled while scrolling a long list. */}
            <tr className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/90 text-[11px] font-semibold text-slate-500 backdrop-blur">
              <SortHeader label="الحملة" sortKey="name" sort={sort} onSort={onSort} className="w-full max-w-0 text-right" />
              <SortHeader label="القناة" sortKey="channel" sort={sort} onSort={onSort} />
              <SortHeader label="الحالة" sortKey="status" sort={sort} onSort={onSort} />
              <SortHeader label="أُرسلت" sortKey="sentCount" sort={sort} onSort={onSort} align="left" className="text-left" />
              <SortHeader label="وصلت" sortKey="deliveredCount" sort={sort} onSort={onSort} align="left" className="text-left" />
              <SortHeader label="فشلت" sortKey="failedCount" sort={sort} onSort={onSort} align="left" className="text-left" />
              <SortHeader label="التاريخ" sortKey="date" sort={sort} onSort={onSort} />
              <th scope="col" className="w-px px-3 py-2.5">
                <span className="sr-only">إجراءات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const ch = channelMeta(c.channel);
              const st = statusMeta(c.status);
              const Icon = ch.icon;
              const showResults = hasResults(c);
              const date = rowDate(c);
              // Straight to the campaign's report on its own channel page. The
              // separate detail screen this used to open has been removed — it
              // showed a summary of numbers the channel page already owns, and
              // its lifecycle buttons now live in the row menu at the end.
              const href = `${ch.href}?campaign=${c.id}`;

              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(href)}
                  className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/70"
                >
                  <td className="max-w-0 px-3 py-2.5 align-middle">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", ch.tile)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        {/* A real link inside the row keeps the campaign reachable by keyboard;
                            the row click is a convenience on top of it, not the only way in. */}
                        <Link
                          href={href}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate text-[13px] font-semibold text-slate-900 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {c.name}
                        </Link>
                        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                          <Users className="h-3 w-3 shrink-0" />
                          {audienceLabel(c.audienceSegmentKey, LOCALE_LABELS)}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ch.dot)} />
                      {ch.label}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium", st.tone)}>
                      {st.label}
                    </span>
                  </td>

                  <CountCell value={c.sentCount} show={showResults} />
                  <CountCell value={c.deliveredCount} show={showResults} tone="text-emerald-700" />
                  <CountCell value={c.failedCount} show={showResults} tone="text-rose-700" />

                  <td className="whitespace-nowrap px-3 py-2.5 align-middle text-slate-600">
                    <div className="flex flex-col leading-tight">
                      <span className="tabular-nums">{date.label}</span>
                      <span className="text-[10px] text-slate-400">{date.caption}</span>
                    </div>
                  </td>

                  <td className="w-px whitespace-nowrap px-3 py-2.5 align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      <CampaignRowActions campaign={c} onChanged={onChanged} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

