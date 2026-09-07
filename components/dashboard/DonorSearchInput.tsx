"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  /** The search term currently APPLIED to the list (not the draft in the box). */
  value: string;
  /** Fired only when the user actually commits — Enter, the icon, blur, or clear. */
  onCommit: (next: string) => void;
  /** Shows a spinner in place of the magnifier while the list refetches. */
  loading?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Donor search box for the paginated dashboard tables (donations, monthly
 * payments, subscriptions).
 *
 * Commits rather than debounces: every one of these lists is server-paginated,
 * so each keystroke would be a round-trip that also has to reset paging. The
 * surrounding filter UI already uses the same Enter-or-click idiom.
 *
 * Blur also commits, so a term typed and then clicked away from still applies —
 * the usual "I typed it but nothing happened" trap. The icon buttons suppress
 * mousedown so clicking them can't fire a blur-commit and a click-commit as two
 * separate fetches.
 */
export function DonorSearchInput({
  value,
  onCommit,
  loading = false,
  placeholder = "بحث بالاسم أو البريد الإلكتروني…",
  className,
}: Props) {
  const [draft, setDraft] = useState(value);

  // Re-sync when the applied term changes from outside (e.g. a filter reset),
  // without clobbering what the user is mid-way through typing.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  const clear = () => {
    setDraft("");
    if (value) onCommit("");
  };

  const showClear = draft.length > 0 || value.length > 0;

  return (
    <div className={cn("relative w-full sm:w-[260px]", className)} dir="rtl">
      <button
        type="button"
        title="بحث"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-brand hover:bg-brand/10 disabled:opacity-50"
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
      </button>

      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            clear();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 text-xs rounded-lg border-slate-200 bg-slate-50/50 pr-9 pl-8"
      />

      {showClear && (
        <button
          type="button"
          title="مسح البحث"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
