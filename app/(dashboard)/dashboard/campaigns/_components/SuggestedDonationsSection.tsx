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
  DEFAULT_SUGGESTED_DONATION_AMOUNTS,
  parseSuggestedDonations,
  parseAmountsInput,
  type SuggestedDonationsConfig,
} from "@/lib/campaign/suggested-donations";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";

type Row = { id: string; currency: string; amountsStr: string };

function makeRow(currency = "USD", amountsStr = ""): Row {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    currency,
    amountsStr,
  };
}

export type SuggestedDonationsPayload = {
  amounts: number[];
  byCurrency: Record<string, number[]>;
};

export type SuggestedDonationsSectionRef = {
  getPayload: () => SuggestedDonationsPayload;
};

type Props = {
  /** Parsed config from API, or undefined before load / for new campaign */
  initialConfig?: SuggestedDonationsConfig | null;
};

export const SuggestedDonationsSection = forwardRef<
  SuggestedDonationsSectionRef,
  Props
>(function SuggestedDonationsSection({ initialConfig }, ref) {
  const [amountsStr, setAmountsStr] = useState(
    () => DEFAULT_SUGGESTED_DONATION_AMOUNTS.join(", ")
  );
  const [rows, setRows] = useState<Row[]>([]);

  const stableKey = useMemo(
    () => JSON.stringify(initialConfig ?? null),
    [initialConfig]
  );

  useEffect(() => {
    const p = parseSuggestedDonations(initialConfig);
    setAmountsStr(p.amounts.join(", "));
    setRows(
      Object.entries(p.byCurrency).map(([currency, amounts]) =>
        makeRow(currency, amounts.join(", "))
      )
    );
  }, [stableKey]);

  useImperativeHandle(ref, () => ({
    getPayload: (): SuggestedDonationsPayload => {
      let amounts = parseAmountsInput(amountsStr);
      if (!amounts.length) amounts = [...DEFAULT_SUGGESTED_DONATION_AMOUNTS];
      const byCurrency: Record<string, number[]> = {};
      for (const r of rows) {
        const code = r.currency.trim().toUpperCase();
        if (!code) continue;
        const arr = parseAmountsInput(r.amountsStr);
        if (arr.length) byCurrency[code] = arr;
      }
      return { amounts, byCurrency };
    },
  }));

  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const updateRow = (id: string, patch: Partial<Pick<Row, "currency" | "amountsStr">>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  return (
    <div className="space-y-4 md:col-span-2" dir="rtl">
      <div>
        <Label htmlFor="suggested-amounts-default">
          مبالغ التبرع المقترحة (جميع العملات)
        </Label>
        <Input
          id="suggested-amounts-default"
          className="mt-1.5 font-mono text-left"
          dir="ltr"
          value={amountsStr}
          onChange={(e) => setAmountsStr(e.target.value)}
          placeholder={DEFAULT_SUGGESTED_DONATION_AMOUNTS.join(", ")}
        />
        <p className="text-sm text-muted-foreground mt-1.5">
          أرقام مفصولة بفاصلة أو مسافة. تُستخدم لكل العملات ما لم تضف استثناءً
          أدناه.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label>استثناءات حسب العملة (اختياري)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="w-4 h-4" />
            إضافة عملة
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            بدون استثناءات، تُطبّق القيم أعلاه على USD وEUR وجميع العملات الأخرى.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3"
              >
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">العملة</Label>
                  <Select
                    value={row.currency}
                    onValueChange={(v) => updateRow(row.id, { currency: v })}
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
                  <Label className="text-xs text-muted-foreground">المبالغ لهذه العملة</Label>
                  <Input
                    className="mt-1 font-mono text-left"
                    dir="ltr"
                    value={row.amountsStr}
                    onChange={(e) =>
                      updateRow(row.id, { amountsStr: e.target.value })
                    }
                    placeholder="مثال: 50, 100, 200"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  onClick={() => removeRow(row.id)}
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
