"use client";

import * as React from "react";
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Trash2, Loader2 } from "lucide-react";
import { SUPPORTED_LOCALES, LOCALE_LABELS, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/locales";
import { cn } from "@/lib/utils";

/**
 * The shared frame for the Template Center's editor dialogs.
 *
 * The four editors had each grown their own copy of the same shell, and each copy carried the same
 * two layout faults:
 *
 *  1. Horizontal overflow. `DialogContent`'s base class list is `grid w-full max-w-lg`; the editors
 *     overrode the width but inherited the `grid`. Grid items get `min-width: auto`, so the
 *     two-column body — a monospace textarea, a wall of `{{token}}` chips, a `whitespace-pre-wrap`
 *     preview — could not shrink below its content and widened the track past the dialog. Fixed at
 *     the root here (`flex` displaces `grid` through twMerge) and defended per-column with `min-w-0`,
 *     so the columns actually narrow instead of pushing sideways.
 *  2. The whole dialog scrolled. `max-h-[90vh] overflow-y-auto` on the content box meant the title
 *     and the حفظ button scrolled away, which is precisely backwards for a long form. The frame is
 *     now header / scroll-region / footer, so the two things you navigate by stay put.
 *
 * It also moves the close button. Radix pins it `right-4`, which in an RTL dialog is where the
 * Arabic title starts — the ✕ sat on top of the heading in all four. Rendering it in the header
 * flex row puts it on the correct side by construction rather than by a hardcoded offset.
 */

export type DialogAccent = "brand" | "whatsapp" | "sms";

/**
 * Per-channel accent. Each channel already had an identity in the lists (WhatsApp green, brand blue);
 * SMS takes the brand orange so the three read as siblings rather than three unrelated blues.
 */
export const ACCENTS: Record<
  DialogAccent,
  { tile: string; chipActive: string; chipHover: string; save: string }
> = {
  brand: {
    tile: "bg-brand/10 text-brand",
    chipActive: "border-brand bg-brand text-white",
    chipHover: "hover:border-brand hover:text-brand",
    save: "bg-brand hover:bg-brand/90",
  },
  whatsapp: {
    tile: "bg-[#25D366]/10 text-[#128C7E]",
    chipActive: "border-[#25D366] bg-[#25D366] text-white",
    chipHover: "hover:border-[#25D366] hover:text-[#128C7E]",
    save: "bg-[#25D366] hover:bg-[#25D366]/90",
  },
  sms: {
    tile: "bg-brand-orange/10 text-brand-orange-700",
    chipActive: "border-brand-orange bg-brand-orange text-white",
    chipHover: "hover:border-brand-orange hover:text-brand-orange-700",
    save: "bg-brand-orange hover:bg-brand-orange-600",
  },
};

const SIZES = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  full: "max-w-[1400px] h-[calc(100%-2rem)]",
} as const;

interface ShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: DialogAccent;
  size?: keyof typeof SIZES;
  /** Rendered flush under the header, outside the scroll region (e.g. the locale strip). */
  toolbar?: React.ReactNode;
  /** Replaces the body entirely while true. */
  loading?: boolean;
  children: React.ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  /** Body padding is dropped for editors that host their own full-bleed surface (the email builder). */
  bodyClassName?: string;
}

export function TemplateDialogShell({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  accent = "brand",
  size = "md",
  toolbar,
  loading,
  children,
  onCancel,
  onSave,
  saving,
  saveDisabled,
  saveLabel = "حفظ",
  bodyClassName,
}: ShellProps) {
  const a = ACCENTS[accent];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px]" />
      <DialogContent
        hideCloseButton
        dir="rtl"
        className={cn(
          // `flex` here is what displaces the base `grid` — see the note above.
          "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-h-[92vh] -translate-x-1/2 -translate-y-1/2 flex-col",
          "overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl ring-1 ring-slate-900/5",
          SIZES[size],
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border bg-white px-5 py-4">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", a.tile)}>{icon}</span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-bold text-slate-900">{title}</DialogTitle>
            {subtitle ? (
              <DialogDescription className="mt-0.5 text-xs leading-5 text-slate-500">
                {subtitle}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="-me-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {toolbar}

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
            bodyClassName ?? "px-5 py-4",
          )}
        >
          {loading ? (
            <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="me-2 h-6 w-6 animate-spin" /> جاري التحميل…
            </div>
          ) : (
            children
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-slate-50/80 px-5 py-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={onSave} disabled={saving || saveDisabled} className={a.save}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {saveLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The locale picker, previously copy-pasted into all three template editors.
 *
 * Wraps rather than scrolls. The old `overflow-x-auto` was written when there were a handful of
 * locales; `SUPPORTED_LOCALES` now holds eight, which is more than fits, so the last few sat behind
 * a horizontal scrollbar nobody thinks to drag. Wrapping costs a second row and hides nothing.
 */
export function LocaleStrip({
  enabled,
  activeLocale,
  onSelect,
  onEnable,
  onRemove,
  accent = "brand",
}: {
  enabled: (loc: SupportedLocale) => boolean;
  activeLocale: SupportedLocale;
  onSelect: (loc: SupportedLocale) => void;
  onEnable: (loc: SupportedLocale) => void;
  onRemove: (loc: SupportedLocale) => void;
  accent?: DialogAccent;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-slate-50/70 px-5 py-2.5">
      <span className="me-1 text-[11px] font-semibold text-slate-500">اللغات</span>
      {SUPPORTED_LOCALES.map((loc) => {
        const has = enabled(loc);
        const active = activeLocale === loc;
        const isDefault = loc === DEFAULT_LOCALE;
        return (
          <span
            key={loc}
            className={cn(
              "inline-flex items-center rounded-md border transition-colors",
              active
                ? a.chipActive
                : has
                  ? cn("border-border bg-white text-slate-700", a.chipHover)
                  : cn("border-dashed border-slate-300 bg-transparent text-slate-400", a.chipHover),
            )}
          >
            <button
              type="button"
              onClick={() => (has ? onSelect(loc) : onEnable(loc))}
              className="px-2.5 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              title={has ? `تحرير النسخة بـ${LOCALE_LABELS[loc]}` : `إضافة نسخة بـ${LOCALE_LABELS[loc]}`}
            >
              {LOCALE_LABELS[loc]}
              {!has && <span className="ms-1">+</span>}
              {isDefault && <span className="ms-1 text-[9px] opacity-70">افتراضي</span>}
            </button>
            {has && !isDefault && (
              <button
                type="button"
                onClick={() => onRemove(loc)}
                className={cn(
                  "pe-1.5 ps-0.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-red-600",
                )}
                title={`حذف نسخة ${LOCALE_LABELS[loc]}`}
                aria-label={`حذف نسخة ${LOCALE_LABELS[loc]}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Consistent field label — the four editors were drifting between three different sizes. */
export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate-600">
      <span className="truncate">{children}</span>
      {hint && <span className="shrink-0 text-[10px] font-normal text-slate-400">{hint}</span>}
    </label>
  );
}
