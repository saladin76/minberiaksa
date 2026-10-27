"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
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
  parseSuggestedTeamSupport,
  parseAmountsInput,
  type SuggestedTeamSupportConfig,
} from "@/lib/campaign/suggested-team-support";
import { SUPPORTED_CURRENCY_OPTIONS } from "@/lib/supported-currencies";
import { dashDir, dt } from "@/lib/dashboard/i18n";

type Row = { id: string; currency: string; amountsStr: string };

function makeRow(currency = "USD", amountsStr = ""): Row {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    currency,
    amountsStr,
  };
}

export type SuggestedTeamSupportPayload = {
  amounts: number[];
  byCurrency: Record<string, number[]>;
};

export type SuggestedTeamSupportSectionRef = {
  /**
   * Returns the current form value:
   *  - `null` if everything is blank (signals "use the next fallback layer")
   *  - `{ amounts, byCurrency }` otherwise
   */
  getPayload: () => SuggestedTeamSupportPayload | null;
};

type Props = {
  onValueChange?: (payload: SuggestedTeamSupportPayload | null) => void;
  initialConfig?: SuggestedTeamSupportConfig | null;
  /** Top-level label (Arabic) */
  label: string;
  /** Helper text under the main input */
  helpText: string;
  /** Placeholder shown in the empty input (e.g. the inherited defaults) */
  defaultPlaceholder: string;
  /** Label for the exceptions section */
  exceptionsLabel: string;
  /** Hint shown when there are no per-currency overrides */
  exceptionsEmptyHint: string;
};

export const SuggestedTeamSupportSection = forwardRef<
  SuggestedTeamSupportSectionRef,
  Props
>(function SuggestedTeamSupportSection(
  { initialConfig, label, helpText, defaultPlaceholder, exceptionsLabel, exceptionsEmptyHint, onValueChange },
  ref
) {
  const defaultInputId = useId();
  const [amountsStr, setAmountsStr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const stableKey = useMemo(
    () => JSON.stringify(initialConfig ?? null),
    [initialConfig]
  );

  useEffect(() => {
    const p = parseSuggestedTeamSupport(initialConfig);
    setAmountsStr(p.amounts.length ? p.amounts.join(", ") : "");
    setRows(
      Object.entries(p.byCurrency).map(([currency, amounts]) =>
        makeRow(currency, amounts.join(", "))
      )
    );
  }, [stableKey]);

  const notifyRef = useRef(onValueChange); notifyRef.current = onValueChange;
  const readPayload = useCallback((): SuggestedTeamSupportPayload | null => {
    const amounts = parseAmountsInput(amountsStr); const byCurrency: Record<string, number[]> = {};
    for (const row of rows) { const code = row.currency.trim().toUpperCase(); const values = parseAmountsInput(row.amountsStr); if (code && values.length) byCurrency[code] = values; }
    return amounts.length || Object.keys(byCurrency).length ? { amounts, byCurrency } : null;
  }, [amountsStr, rows]);
  useEffect(() => { notifyRef.current?.(readPayload()); }, [readPayload]);
  useImperativeHandle(ref, () => ({ getPayload: readPayload }), [readPayload]);

  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const updateRow = (
    id: string,
    patch: Partial<Pick<Row, "currency" | "amountsStr">>
  ) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-4 md:col-span-2" dir={dashDir()}>
      <div>
        <Label htmlFor={defaultInputId}>{label}</Label>
        <Input
          id={defaultInputId}
          className="mt-1.5 font-mono text-left"
          dir="ltr"
          value={amountsStr}
          onChange={(e) => setAmountsStr(e.target.value)}
          placeholder={defaultPlaceholder}
        />
        <p className="text-sm text-muted-foreground mt-1.5">{helpText}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label>{exceptionsLabel}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            {dt("إضافة عملة")}</Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{exceptionsEmptyHint}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col sm:flex-row gap-2 sm:items-end border rounded-lg p-3"
              >
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs text-muted-foreground">{dt("العملة")}</Label>
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
                          {c.code}  {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2]">
                  <Label className="text-xs text-muted-foreground">
                    {dt("المبالغ لهذه العملة")}</Label>
                  <Input
                    className="mt-1 font-mono text-left"
                    dir="ltr"
                    value={row.amountsStr}
                    onChange={(e) =>
                      updateRow(row.id, { amountsStr: e.target.value })
                    }
                    placeholder={dt("مثال: 5, 10, 25, 50, 100")}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  onClick={() => removeRow(row.id)}
                  aria-label={dt("حذف الصف")}
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
