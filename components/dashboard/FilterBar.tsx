"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Selects, date pickers, toggles — laid out after the search box. */
  children?: ReactNode;
  /** Right-aligned actions: export, refresh, bulk actions. */
  actions?: ReactNode;
  className?: string;
};

/**
 * One toolbar shape for search + filters + actions.
 *
 * Every list page built its own: `/campaigns` wrapped it in a `Card p-4`, `/monthly` used a
 * bare div with hand-positioned RTL icons, `/ads` had `AdsFiltersBar`. The RTL search-icon
 * offset in particular was re-derived (and got re-broken) on each page.
 */
export function FilterBar({
  searchValue, onSearchChange, searchPlaceholder = "بحث…", children, actions, className,
}: Props) {
  const showSearch = typeof onSearchChange === "function";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-xl border border-slate-200 bg-white",
        className,
      )}
    >
      {showSearch && (
        <div className="relative flex-1 min-w-[200px]">
          {/* `start-3` is a logical property, so the icon follows the reading direction
              instead of needing an RTL-specific `right-3`. */}
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-9 ps-9 pe-8 rounded-lg border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none transition-colors focus:bg-white focus:border-brand focus:ring-1 focus:ring-brand"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange?.("")}
              aria-label="مسح البحث"
              className="absolute end-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {children}

      {actions && <div className="flex items-center gap-2 ms-auto">{actions}</div>}
    </div>
  );
}
