"use client";

import { useEffect } from "react";

/**
 * Marks the page as a payment form so the floating WhatsApp and assistant
 * buttons step aside on phones (CSS keys off `data-mia-form`). On the cart and
 * checkout they sat over the amount chips and the name fields — the one place a
 * mis-tap costs a donation.
 */
export function useQuietFloatingButtons(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-mia-form", "1");
    return () => root.removeAttribute("data-mia-form");
  }, []);
}
