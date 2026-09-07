"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_SUGGESTED_SHARE_COUNTS,
  parseSuggestedShareCounts,
  type SuggestedShareCountsConfig,
} from "@/lib/campaign/campaign-modes";
import { parseAmountsInput } from "@/lib/campaign/suggested-donations";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";

type PriceRow = { id: string; currency: string; priceStr: string };

function makePriceRow(currency = "USD", priceStr = ""): PriceRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    currency,
    priceStr,
  };
}

export type SuggestedShareCountsPayload = {
  counts: number[];
  priceByCurrency: Record<string, number>;
};

export type SuggestedShareCountsSectionRef = {
  getPayload: () => SuggestedShareCountsPayload;
};

type Props = {
  initialConfig?: SuggestedShareCountsConfig | null;
};

export const SuggestedShareCountsSection = forwardRef<
  SuggestedShareCountsSectionRef,
  Props
>(function SuggestedShareCountsSection({ initialConfig }, ref) {
  const [countsStr, setCountsStr] = useState(
    () => DEFAULT_SUGGESTED_SHARE_COUNTS.join(", ")
  );
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);

  const stableKey = useMemo(
    () => JSON.stringify(initialConfig ?? null),
    [initialConfig]
  );

  useEffect(() => {
    const p = parseSuggestedShareCounts(initialConfig);
    setCountsStr(p.counts.join(", "));
    const byCurrency = p.priceByCurrency ?? {};
    setPriceRows(
      Object.entries(byCurrency).map(([currency, price]) =>
        makePriceRow(currency, String(price))
      )
    );
  }, [stableKey]);

  useImperativeHandle(ref, () => ({
    getPayload: () => {
      let counts = parseAmountsInput(countsStr.replace(/،/g, ","));
      counts = counts.map((n) => Math.floor(n)).filter((n) => n >= 1);
      counts = [...new Set(counts)].sort((a, b) => a - b);
      if (!counts.length) counts = [...DEFAULT_SUGGESTED_SHARE_COUNTS];
      if (counts.length > 12) counts = counts.slice(0, 12);

      const priceByCurrency: Record<string, number> = {};
      for (const row of priceRows) {
        const code = row.currency.trim().toUpperCase();
        if (!code) continue;
        const n = Number(row.priceStr);
        if (Number.isFinite(n) && n > 0) priceByCurrency[code] = n;
      }
      return { counts, priceByCurrency };
    },
  }));

  const addPriceRow = () =>
    setPriceRows((prev) => [...prev, makePriceRow()]);

  const removePriceRow = (id: string) =>
    setPriceRows((prev) => prev.filter((r) => r.id !== id));

  const updatePriceRow = (
    id: string,
    patch: Partial<Pick<PriceRow, "currency" | "priceStr">>
  ) => {
    setPriceRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-2 rounded-lg border border-border p-4 bg-muted/30">
        <Label className="text-sm font-medium">
          أعداد الأسهم المقترحة
        </Label>
        <Input
          value={countsStr}
          onChange={(e) => setCountsStr(e.target.value)}
          placeholder="1, 5, 10, 25, 50"
          dir="ltr"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          تُعرض كأزرار سريعة عند اختيار التبرع بعدد الأسهم. الافتراضي:{" "}
          {DEFAULT_SUGGESTED_SHARE_COUNTS.join(", ")}
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4 bg-muted/30">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label>استثناءات سعر السهم حسب العملة (اختياري)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPriceRow}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            إضافة عملة
          </Button>
        </div>
        {priceRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            بدون استثناءات، يُحوَّل سعر السهم بالدولار تلقائيًا لعملة المتبرع.
            أضف استثناءً لتحديد سعر ثابت لعملة بعينها.
          </p>
        ) : (
          <div className="space-y-3">
            {priceRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3 bg-white"
              >
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">العملة</Label>
                  <Select
                    value={row.currency}
                    onValueChange={(v) =>
                      updatePriceRow(row.id, { currency: v })
                    }
                  >
                    <SelectTrigger className="mt-1" dir="ltr">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2]">
                  <Label className="text-xs text-muted-foreground">
                    سعر السهم الواحد بهذه العملة
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 font-mono text-left"
                    dir="ltr"
                    value={row.priceStr}
                    onChange={(e) =>
                      updatePriceRow(row.id, { priceStr: e.target.value })
                    }
                    placeholder="مثال: 100"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  onClick={() => removePriceRow(row.id)}
                  aria-label="حذف الصف"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
