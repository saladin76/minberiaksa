"use client";

import * as React from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { GENDER_LABEL_AR, type NormalizedGender } from "@/lib/dashboard/user-demographics";
import { cn } from "@/lib/utils";

/**
 * Gender + age-range filters, shared by المتبرعون and the campaign audience
 * step so a segment means the same thing in both places.
 *
 * Age is offered as named brackets rather than two number inputs: the operator
 * is picking an audience, not running a query, and a pair of free-number boxes
 * invites 25→18 ranges that silently match nobody. Each bracket maps to a
 * min/max the API turns into a birthdate range.
 */

export type AgeBracket = "all" | "u25" | "25-34" | "35-44" | "45-54" | "55p";

export const AGE_BRACKETS: { value: AgeBracket; label: string; min: number | null; max: number | null }[] = [
  { value: "all", label: "كل الأعمار", min: null, max: null },
  { value: "u25", label: "أقل من ٢٥", min: null, max: 24 },
  { value: "25-34", label: "٢٥ – ٣٤", min: 25, max: 34 },
  { value: "35-44", label: "٣٥ – ٤٤", min: 35, max: 44 },
  { value: "45-54", label: "٤٥ – ٥٤", min: 45, max: 54 },
  { value: "55p", label: "٥٥ فأكثر", min: 55, max: null },
];

const BRACKET_BY_VALUE = new Map(AGE_BRACKETS.map((b) => [b.value, b]));

export function ageBracketLabel(value: AgeBracket): string {
  return BRACKET_BY_VALUE.get(value)?.label ?? value;
}

/** Adds `minAge` / `maxAge` to a param bag for the chosen bracket. */
export function applyAgeBracketParams(params: URLSearchParams, value: AgeBracket) {
  const b = BRACKET_BY_VALUE.get(value);
  if (!b || value === "all") return;
  if (b.min !== null) params.set("minAge", String(b.min));
  if (b.max !== null) params.set("maxAge", String(b.max));
}

/** Same, as a plain object for JSON request bodies. */
export function ageBracketBody(value: AgeBracket): { minAge?: number; maxAge?: number } {
  const b = BRACKET_BY_VALUE.get(value);
  if (!b || value === "all") return {};
  return {
    ...(b.min !== null ? { minAge: b.min } : {}),
    ...(b.max !== null ? { maxAge: b.max } : {}),
  };
}

export type GenderFilterValue = "all" | NormalizedGender;

export function genderFilterLabel(value: GenderFilterValue): string {
  return value === "all" ? "كل الأنواع" : GENDER_LABEL_AR[value];
}

export function GenderFilterSelect({
  value,
  onChange,
  className,
}: {
  value: GenderFilterValue;
  onChange: (next: GenderFilterValue) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GenderFilterValue)}>
      <SelectTrigger aria-label="تصفية بالجنس" className={cn(className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-xs">كل الأنواع</SelectItem>
        <SelectItem value="male" className="text-xs">{GENDER_LABEL_AR.male}</SelectItem>
        <SelectItem value="female" className="text-xs">{GENDER_LABEL_AR.female}</SelectItem>
        <SelectItem value="undisclosed" className="text-xs">{GENDER_LABEL_AR.undisclosed}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AgeFilterSelect({
  value,
  onChange,
  className,
}: {
  value: AgeBracket;
  onChange: (next: AgeBracket) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AgeBracket)}>
      <SelectTrigger aria-label="تصفية بالعمر" className={cn(className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AGE_BRACKETS.map((b) => (
          <SelectItem key={b.value} value={b.value} className="text-xs">
            {b.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
