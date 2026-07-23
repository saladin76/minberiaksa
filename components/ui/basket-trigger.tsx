"use client";

import { useRef } from "react";
import { BasketIcon } from "./icons";
import { useBasket } from "@/components/basket/use-basket";

export function BasketTrigger({ compact = false }: { compact?: boolean }) {
  const { items, openDrawer } = useBasket();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const openBasket = () => {
    window.dispatchEvent(new Event("minber:close-navigation"));
    openDrawer(triggerRef.current);
  };

  return (
    <button
      ref={triggerRef}
      type="button"
      className={`basket-trigger ${compact ? "basket-trigger--compact" : ""}`}
      aria-label={`سلة العطاء، ${items.length} عناصر`}
      aria-haspopup="dialog"
      onClick={openBasket}
    >
      <BasketIcon />
      {!compact ? <span>سلة العطاء</span> : null}
      <span className="basket-count" aria-hidden="true">{items.length}</span>
    </button>
  );
}
