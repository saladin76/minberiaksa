"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CART_COUNT_KEY,
  CART_UPDATED_EVENT,
  type MinbarCartItem,
  addToCart,
  readCart,
  readCartCount,
  removeFromCart,
  writeCart,
} from "@/lib/minbar/cart";

/**
 * Live view of the Minbar cart.
 *
 * State starts empty rather than reading storage during render: the first
 * client render has to match the server's HTML or React discards it, and the
 * server cannot know what is in `localStorage`. The real value lands in the
 * effect right after mount.
 *
 * Two events are listened for, exactly as the handoff's header does:
 *  - `mia:basket-updated`, dispatched by every write in this tab;
 *  - `storage`, so a second tab on the same site stays in step.
 */
export function useMinbarCart() {
  const [items, setItems] = useState<MinbarCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => setItems(readCart()), []);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onUpdate = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_COUNT_KEY) refresh();
    };
    window.addEventListener(CART_UPDATED_EVENT, onUpdate);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const add = useCallback((item: MinbarCartItem) => setItems(addToCart(item)), []);
  const remove = useCallback((index: number) => setItems(removeFromCart(index)), []);
  const replace = useCallback((next: MinbarCartItem[]) => {
    writeCart(next);
    setItems(next);
  }, []);

  return { items, count: items.length, hydrated, add, remove, replace, refresh };
}

/**
 * Item count only — for the header badge, which does not need to deserialise
 * the whole cart on every update.
 */
export function useMinbarCartCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(readCartCount());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_COUNT_KEY) sync();
    };
    window.addEventListener(CART_UPDATED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return count;
}
