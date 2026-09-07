"use client";

import type * as React from "react";
import hotToast from "react-hot-toast";

/**
 * Adapter: shadcn's `useToast()` call shape on top of `react-hot-toast`.
 *
 * This file used to be the full shadcn toast store. It "worked" in the sense that it updated
 * internal state — but rendering that state requires shadcn's `<Toaster />`
 * (components/ui/toaster.tsx), and **nothing in this app ever mounted it**. The app mounts
 * `react-hot-toast`'s `<Toaster />` instead (app/[locale]/layout.tsx and
 * app/(dashboard)/dashboard/DashboardLayoutClient.tsx).
 *
 * So every `toast({...})` call through this hook was silently invisible. That hit two live
 * dashboard pages:
 *   - /dashboard/blog   (3 calls)
 *   - /dashboard/ticker (7 calls)
 * including error paths like "فشل في تحميل إعدادات شريط التبرعات" — an admin saw a failed save
 * as complete silence.
 *
 * Rewriting the hook rather than the 10 call sites keeps the diff small and fixes both pages at
 * once. It also drops this file's dependency on components/ui/toast.tsx, which imports the
 * uninstalled `@radix-ui/react-toast` (see P2-4).
 */

type ToastVariant = "default" | "destructive";

export type ToastArgs = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** Accepted and ignored — react-hot-toast has no action-button slot. */
  action?: unknown;
};

/** Flattens {title, description} into one line; non-text ReactNodes are dropped. */
function toMessage(title?: React.ReactNode, description?: React.ReactNode): string {
  const parts = [title, description]
    .filter((part) => part != null && part !== "")
    .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
    .filter(Boolean);
  return parts.join(" — ") || "…";
}

export function toast({ title, description, variant }: ToastArgs) {
  const message = toMessage(title, description);
  const id = variant === "destructive" ? hotToast.error(message) : hotToast.success(message);
  return { id, dismiss: () => hotToast.dismiss(id), update: () => {} };
}

/**
 * Shape of a queued toast. Always an empty list at runtime — react-hot-toast owns rendering —
 * but typed as a real object array so the (orphaned) shadcn `<Toaster />` in
 * components/ui/toaster.tsx still destructures `{ id, title, description, action, ...props }`
 * without a type error. A bare `[] as const` breaks that rest-element destructuring.
 */
export type QueuedToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: unknown;
};

export function useToast() {
  return {
    toast,
    dismiss: (id?: string) => hotToast.dismiss(id),
    /** Always empty: react-hot-toast owns rendering, so there is no local queue to expose. */
    toasts: [] as QueuedToast[],
  };
}
