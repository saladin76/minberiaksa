"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

type SelectorOption = { id: string; primary: string; secondary?: string; badge?: string };
type Props = {
  open: boolean;
  title: string;
  searchLabel: string;
  emptyLabel: string;
  selectedId: string;
  options: SelectorOption[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSelect: (id: string) => void;
  notice?: string;
};

const focusable = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SelectorSheet({ open, title, searchLabel, emptyLabel, selectedId, options, triggerRef, onClose, onSelect, notice }: Props) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return options;
    return options.filter((option) => `${option.primary} ${option.secondary ?? ""} ${option.id}`.toLocaleLowerCase().includes(value));
  }, [options, query]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable));
    requestAnimationFrame(() => dialog.querySelector<HTMLInputElement>("input")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const available = items();
      if (!available.length) return;
      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
      setQuery("");
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  return (
    <div className="selector-layer">
      <button className="selector-backdrop" type="button" aria-label="إغلاق" onClick={onClose} />
      <div ref={dialogRef} className="selector-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label="إغلاق">×</button></header>
        <label className="selector-sheet__search"><span>{searchLabel}</span><input value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" /></label>
        <div className="selector-sheet__options" role="listbox" aria-label={title}>
          {filtered.map((option) => (
            <button key={option.id} className="selector-sheet__option" type="button" role="option" aria-selected={selectedId === option.id} onClick={() => onSelect(option.id)}>
              <span><strong>{option.primary}</strong>{option.secondary ? <small>{option.secondary}</small> : null}</span>
              {option.badge ? <b>{option.badge}</b> : null}
              {selectedId === option.id ? <i aria-hidden="true">✓</i> : null}
            </button>
          ))}
          {!filtered.length ? <p className="selector-sheet__empty">{emptyLabel}</p> : null}
        </div>
        {notice ? <p className="selector-sheet__notice" role="status">{notice}</p> : null}
      </div>
    </div>
  );
}
