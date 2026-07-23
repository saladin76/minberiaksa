"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { BasketItem } from "@/types/basket";

function normalizeAmount(value: string) {
  return value.trim().replace(",", ".");
}

function getAmountError(value: string, minimumAmount?: number) {
  const normalized = normalizeAmount(value);
  if (!normalized) return "أدخل مبلغًا صحيحًا.";
  if (!/^\d+(\.\d+)?$/.test(normalized)) return "يرجى استخدام أرقام فقط.";
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return "أدخل مبلغًا صحيحًا.";
  if (minimumAmount && amount < minimumAmount) return "المبلغ أقل من الحد المتاح.";
  return "";
}

export function BasketAmountControl({
  item,
  disabled = false,
  onChange,
  onValidityChange,
}: {
  item: BasketItem;
  disabled?: boolean;
  onChange: (amount: number) => void;
  onValidityChange?: (id: string, valid: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(item.amount));
  const [error, setError] = useState("");
  const errorId = useId();
  const step = useMemo(() => Math.max(1, Math.min(25, Math.round(item.minimumAmount ?? 25))), [item.minimumAmount]);

  useEffect(() => {
    setDraft(String(item.amount));
    setError("");
  }, [item.amount]);

  useEffect(() => {
    onValidityChange?.(item.id, !error);
  }, [error, item.id, onValidityChange]);

  const commit = (nextDraft = draft) => {
    const nextError = getAmountError(nextDraft, item.minimumAmount);
    setError(nextError);
    if (nextError) return;
    const value = Number(normalizeAmount(nextDraft));
    if (value !== item.amount) onChange(value);
  };

  const adjust = (direction: -1 | 1) => {
    if (disabled) return;
    const parsed = Number(normalizeAmount(draft));
    const base = Number.isFinite(parsed) && parsed > 0 ? parsed : item.amount;
    const minimum = item.minimumAmount ?? 1;
    const next = Math.max(minimum, base + direction * step);
    const nextDraft = String(Number(next.toFixed(3)));
    setDraft(nextDraft);
    setError("");
    onChange(next);
  };

  return (
    <div className="basket-amount-editor" data-amount-editor>
      <div className="basket-amount-label">
        <span>المبلغ</span>
        <strong>{item.currency}</strong>
      </div>
      <div className="basket-amount-control-row">
        <button type="button" aria-label={`خفض مبلغ ${item.projectTitle}`} disabled={disabled} onClick={() => adjust(-1)}>
          <Minus size={17} aria-hidden="true" />
        </button>
        <label>
          <span className="sr-only">مبلغ {item.projectTitle}</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              setError(getAmountError(value, item.minimumAmount));
            }}
            onBlur={() => commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
        </label>
        <button type="button" aria-label={`زيادة مبلغ ${item.projectTitle}`} disabled={disabled} onClick={() => adjust(1)}>
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      {error ? <p id={errorId} className="basket-amount-error" role="alert">{error}</p> : null}
      {item.minimumAmount ? <small>الحد المتاح: {item.minimumAmount.toLocaleString("en-US")} {item.currency}</small> : null}
    </div>
  );
}
