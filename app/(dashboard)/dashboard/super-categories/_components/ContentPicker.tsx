'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Picks the rows of one content model that a super category links, and keeps
 * them in the order they will be rendered.
 *
 * Deliberately not a drag list: the pool can be four hundred campaigns, and a
 * multi-select that also drags is a worse tool than a searchable list plus
 * explicit up/down on the chosen few. Order matters — it is what the page shows
 * — so it is editable, but it is edited on the short list, not the long one.
 */

export interface ContentOption {
  id: string;
  title: string;
  hint: string;
  live: boolean;
}

export function ContentPicker({
  label,
  description,
  options,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  options: ContentOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o] as const)), [options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = options.filter((o) => !value.includes(o.id));
    if (!q) return pool.slice(0, 40);
    return pool.filter((o) => `${o.title} ${o.hint}`.toLowerCase().includes(q)).slice(0, 40);
  }, [options, value, query]);

  const move = (index: number, delta: number) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-slate-700">{label}</span>
          {description ? <p className="text-[11px] text-slate-500">{description}</p> : null}
        </div>
        <Badge variant="outline">{value.length}</Badge>
      </div>

      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((id, index) => {
            const option = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded border bg-slate-50 px-2 py-1.5">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {option?.title ?? id}
                  {option && !option.live ? (
                    <span className="mr-1 text-[10px] font-normal text-amber-600"> (غير منشور)</span>
                  ) : null}
                  {!option ? <span className="mr-1 text-[10px] font-normal text-red-600"> (محذوف)</span> : null}
                </span>
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(index, -1)} aria-label="أعلى">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(index, 1)} aria-label="أسفل">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onChange(value.filter((v) => v !== id))}
                    aria-label="إزالة"
                  >
                    <X className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute top-2.5 h-3.5 w-3.5 text-slate-400 ltr:left-2 rtl:right-2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث…"
              className="h-8 text-xs ltr:pl-7 rtl:pr-7"
            />
          </div>
          <ul className="max-h-52 space-y-1 overflow-y-auto">
            {matches.length === 0 ? (
              <li className="px-2 py-3 text-center text-[11px] text-slate-500">لا نتائج</li>
            ) : (
              matches.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => { onChange([...value, option.id]); setQuery(''); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start hover:bg-slate-100"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">{option.title}</span>
                    {option.hint ? <span className="shrink-0 text-[10px] text-slate-400" dir="ltr">{option.hint}</span> : null}
                    {!option.live ? <span className="shrink-0 text-[10px] text-amber-600">غير منشور</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
          إضافة
        </Button>
      )}
    </div>
  );
}
