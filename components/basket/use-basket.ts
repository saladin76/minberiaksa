"use client";

import { useContext } from "react";
import { BasketContext } from "./basket-context";

export function useBasket() {
  const value = useContext(BasketContext);
  if (!value) throw new Error("useBasket must be used inside BasketProvider");
  return value;
}
