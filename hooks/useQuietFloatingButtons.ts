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

/**
 * Same, but only while the given element is on screen: the homepage hero's
 * "start donating" and "zakat calculator" buttons sat exactly where the
 * floating WhatsApp and assistant buttons float on a phone. Once the donor
 * scrolls past them, the floating buttons come back.
 */
export function useQuietFloatingButtonsWhileVisible(selector: string): void {
  useEffect(() => {
    const target = document.querySelector(selector);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) root.setAttribute("data-mia-hero-cta", "1");
      else root.removeAttribute("data-mia-hero-cta");
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
      root.removeAttribute("data-mia-hero-cta");
    };
  }, [selector]);
}
