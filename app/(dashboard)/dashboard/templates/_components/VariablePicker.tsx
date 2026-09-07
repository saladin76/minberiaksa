"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { VARIABLE_CATALOG } from "@/lib/templates/variables";
import { cn } from "@/lib/utils";

/**
 * The `{{token}}` palette, shared by the WhatsApp and SMS editors.
 *
 * Previously an un-searchable wall of every token in the catalog, pasted into both editors. Two
 * changes beyond the de-duplication: a filter box, because scanning ~30 monospace chips for the one
 * you want is slower than typing three letters; and `break-all` on the chips, since a long token is
 * an unbreakable string that was helping push the editor's grid column wider than the dialog.
 */
export function VariablePicker({
  onInsert,
  className,
}: {
  onInsert: (token: string) => void;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");

  const groups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return VARIABLE_CATALOG;
    return VARIABLE_CATALOG.map((g) => ({
      ...g,
      entries: g.entries.filter(
        (e) => e.token.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
      ),
    })).filter((g) => g.entries.length > 0);
  }, [query]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-slate-50/70", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-white px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في المتغيّرات…"
          className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400"
        />
        <span className="shrink-0 text-[10px] text-slate-400">اضغط للإدراج</span>
      </div>

      <div className="max-h-40 space-y-2 overflow-y-auto overscroll-contain p-2">
        {groups.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-slate-400">لا يوجد متغيّر مطابق</p>
        ) : (
          groups.map((g) => (
            <div key={g.group}>
              <div className="mb-1 text-[10px] font-semibold text-slate-500">{g.group}</div>
              <div className="flex flex-wrap gap-1">
                {g.entries.map((e) => (
                  <button
                    key={e.token}
                    type="button"
                    onClick={() => onInsert(e.token)}
                    className="max-w-full break-all rounded border border-border bg-white px-2 py-0.5 text-start font-mono text-[11px] text-slate-700 transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand"
                    title={e.label}
                  >
                    {e.token}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
