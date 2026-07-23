"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BasketEmptyState } from "./basket-empty-state";
import { BasketLineItem } from "./basket-line-item";
import { BasketSummary } from "./basket-summary";
import { useBasket } from "./use-basket";

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function BasketDrawerLoading() {
  return (
    <div className="giving-drawer-loading" role="status" aria-label="جارٍ تحميل سلة العطاء">
      <span /><span /><span />
    </div>
  );
}

export function BasketDrawer() {
  const { drawerOpen, closeDrawer, items, hydrated, updateItem, removeItem } = useBasket();
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [invalidItems, setInvalidItems] = useState<Set<string>>(new Set());

  const handleValidityChange = useCallback((id: string, valid: boolean) => {
    setInvalidItems((current) => {
      const next = new Set(current);
      if (valid) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setInvalidItems((current) => new Set([...current].filter((id) => items.some((item) => item.id === id))));
  }, [items]);

  useEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("basket-drawer-open");
    requestAnimationFrame(() => closeRef.current?.focus());

    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.body.classList.remove("basket-drawer-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="giving-drawer-layer">
      <button className="giving-drawer-backdrop" type="button" aria-label="إغلاق سلة العطاء" onClick={closeDrawer} />
      <aside ref={drawerRef} className="giving-drawer" role="dialog" aria-modal="true" aria-labelledby="giving-drawer-title" data-basket-drawer>
        <header className="giving-drawer-header">
          <div>
            <h2 id="giving-drawer-title">سلة العطاء</h2>
            <p>راجع نوايا عطائك قبل المتابعة</p>
          </div>
          <button ref={closeRef} className="giving-drawer-close" type="button" aria-label="إغلاق السلة" onClick={closeDrawer}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="giving-drawer-body">
          {!hydrated ? <BasketDrawerLoading /> : null}
          {hydrated && !items.length ? <BasketEmptyState onNavigate={closeDrawer} /> : null}
          {hydrated && items.length ? (
            <div className="giving-drawer-items" aria-live="polite">
              <div className="giving-drawer-items__heading">
                <span>{items.length === 1 ? "نية واحدة" : `${items.length.toLocaleString("ar")} نوايا`}</span>
                <small>راجع المبلغ والعملة لكل نية.</small>
              </div>
              {items.map((item) => (
                <BasketLineItem
                  key={item.id}
                  item={item}
                  onUpdateAmount={(amount) => updateItem(item.id, { amount })}
                  onRemove={() => removeItem(item.id)}
                  onValidityChange={handleValidityChange}
                />
              ))}
            </div>
          ) : null}
        </div>

        {hydrated && items.length ? (
          <footer className="giving-drawer-summary">
            <BasketSummary items={items} actionHref="/basket" invalidCount={invalidItems.size} compact />
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
