"use client";

import type { DefaultLegendContentProps } from "recharts";

type SliceRow = { name?: string; value?: number; count?: number };

function PieLegendInner({
  payload,
  percentBasis,
}: DefaultLegendContentProps & { percentBasis: "value" | "count" }) {
  if (!payload?.length) return null;

  const items = payload.map((entry) => {
    const row = (entry.payload ?? {}) as SliceRow;
    const name =
      (typeof entry.value === "string" ? entry.value : row.name) ?? "—";
    const num = Number(row[percentBasis] ?? 0);
    return { name, color: entry.color, num };
  });

  const total = items.reduce((s, x) => s + x.num, 0);

  return (
    <ul
      className="recharts-default-legend list-none flex flex-wrap justify-center gap-x-5 gap-y-2 px-2 pt-3 pb-0 text-xs text-slate-700"
      dir="rtl"
    >
      {items.map((item, i) => {
        const pct = total > 0 ? ((item.num / total) * 100).toFixed(0) : "0";
        return (
          <li key={i} className="inline-flex items-start gap-2 max-w-[min(100%,280px)]">
            <span
              className="mt-0.5 w-3 h-3 rounded-sm shrink-0 border border-slate-200/80"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-right leading-snug break-words">
              {item.name}
              <span className="text-slate-500 whitespace-nowrap mr-1">
                {" "}
                ({pct}%)
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Legend for pies sized by `dataKey="value"` (amount). */
export const DashboardPieLegendByValue = (props: DefaultLegendContentProps) => (
  <PieLegendInner {...props} percentBasis="value" />
);

/** Legend for pies sized by `dataKey="count"` (e.g. paid vs failed counts). */
export const DashboardPieLegendByCount = (props: DefaultLegendContentProps) => (
  <PieLegendInner {...props} percentBasis="count" />
);
