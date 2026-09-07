"use client";

import { useEffect, useRef } from "react";
import { Pencil, Trash2 } from "lucide-react";

interface Props {
  x: number;
  y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Floating right-click menu pinned at (x, y). Closes on outside-click, Escape,
 * or scroll. Auto-flips to stay inside the viewport on the right/bottom edges.
 * Lightweight enough that we don't need to pull in @radix-ui/react-context-menu.
 */
export function DonationActionsMenu({ x, y, onEdit, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Keep the menu inside the viewport regardless of cursor position.
  const width = 200;
  const heightEstimate = 96;
  const viewportWidth = typeof window === "undefined" ? width + x + 8 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? heightEstimate + y + 8 : window.innerHeight;
  const left = Math.max(8, Math.min(x, viewportWidth - width - 8));
  const top = Math.max(8, Math.min(y, viewportHeight - heightEstimate - 8));

  return (
    <div
      ref={ref}
      role="menu"
      dir="rtl"
      style={{ top, left, width }}
      className="fixed z-[80] rounded-lg border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 text-right"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onEdit();
          onClose();
        }}
        className="flex w-full items-center justify-end gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
      >
        <span>تعديل التبرع</span>
        <Pencil className="h-3.5 w-3.5 text-slate-500" />
      </button>
      <div className="my-1 border-t border-slate-100" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex w-full items-center justify-end gap-2 px-3 py-2 text-xs text-rose-700 hover:bg-rose-50"
      >
        <span>حذف التبرع</span>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
