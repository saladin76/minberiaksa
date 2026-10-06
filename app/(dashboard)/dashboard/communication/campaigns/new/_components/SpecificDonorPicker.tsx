"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type Donor = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLang?: string | null;
  countryCode?: string | null;
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || "تعذر البحث");
  return data;
}

export function SpecificDonorPicker({
  selected,
  onChange,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Donor[]>([]);
  const [picked, setPicked] = React.useState<Donor[]>([]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const q = query.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      fetch(`/api/communication/audiences/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
        .then(readJson)
        .then((data) => setResults((data.donors ?? []).filter((donor: Donor) => !selected.has(donor.id))))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const add = (donor: Donor) => {
    const next = new Set(selected);
    next.add(donor.id);
    onChange(next);
    setPicked((current) => current.some((item) => item.id === donor.id) ? current : [...current, donor]);
    setQuery("");
    setResults([]);
  };

  const remove = (id: string) => {
    const next = new Set(selected);
    next.delete(id);
    onChange(next);
    setPicked((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">أشخاص محددون</h3>
        <p className="mt-1 text-xs text-slate-500">ابحث بالاسم أو الهاتف أو البريد وأضف فقط الأشخاص المطلوبين.</p>
      </div>

      <div className="relative mt-4 max-w-xl">
        <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث بالاسم / الهاتف / البريد"
          className="pr-9"
        />
        {results.length > 0 && (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {results.map((donor) => (
              <button
                key={donor.id}
                type="button"
                onClick={() => add(donor)}
                className="block w-full rounded-lg px-3 py-2 text-right hover:bg-slate-50"
              >
                <div className="text-xs font-semibold text-slate-900">{donor.name ?? "بلا اسم"}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{donor.phone ?? donor.email ?? "لا توجد وسيلة اتصال"}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {picked.map((donor) => (
            <span key={donor.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
              <span className="max-w-[220px] truncate">{donor.name ?? donor.phone ?? donor.email ?? donor.id}</span>
              <button type="button" onClick={() => remove(donor.id)} aria-label="إزالة">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">لم تتم إضافة أي شخص بعد.</p>
      )}
    </div>
  );
}
