"use client";

import { useEffect, useId, useRef } from "react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";

const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export function CheckoutPolicyDialog({ open, onClose, openerRef }: { open: boolean; onClose: () => void; openerRef: RefObject<HTMLButtonElement | null> }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = dialogRef.current;
    const items = () => Array.from(root.querySelectorAll<HTMLElement>(focusable));
    window.requestAnimationFrame(() => items()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => openerRef.current?.focus());
    };
  }, [open, onClose, openerRef]);
  if (!open) return null;
  return <div className="checkout-dialog-layer"><button className="checkout-dialog-backdrop" type="button" aria-label="إغلاق السياسة" onClick={onClose}/><div ref={dialogRef} className="checkout-policy-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}><h2 id={titleId}>سياسة التبرع والخصوصية</h2><strong>LEGAL CONTENT REQUIRED</strong><p>تحتاج السياسة التشغيلية والقانونية إلى الاعتماد قبل الإطلاق.</p><Button type="button" onClick={onClose}>إغلاق</Button></div></div>;
}
