"use client";

import { createContext } from "react";
import type { BasketItem, BasketItemInput, CheckoutSnapshot } from "@/types/basket";

export type BasketContextValue = {
  items: BasketItem[];
  hydrated: boolean;
  drawerOpen: boolean;
  checkoutSnapshot: CheckoutSnapshot | null;
  addItem: (item: BasketItemInput) => BasketItem;
  updateItem: (id: string, updates: Partial<Omit<BasketItem, "id">>) => void;
  removeItem: (id: string) => void;
  restoreItem: (item: BasketItem, index?: number) => void;
  clearBasket: () => void;
  openDrawer: (returnFocus?: