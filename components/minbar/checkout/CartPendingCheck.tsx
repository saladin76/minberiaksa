"use client";

import { useEffect } from "react";
import { clearCart, clearPendingPayment, readPendingPayment } from "@/lib/minbar/cart";
import { donationDetailsUrl } from "@/lib/donations/guest-access-client";

/**
 * The basket stays while a card payment is with the bank (see holdCartForPayment). On any page
 * load this asks the server about that one order: paid → the basket is emptied, so it is never
 * paid twice; declined or abandoned → the basket stays for another try. Read-only; it never
 * starts or retries a payment.
 */
export default function CartPendingCheck() {
  useEffect(() => {
    const pending = readPendingPayment();
    if (!pending) return;
    const url = donationDetailsUrl(pending.donationId, pending.token ?? "");
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((details: { paidAt?: string | null; status?: string } | null) => {
        if (!details) return;
        // Only a settled payment (paidAt) empties the basket: a new order already reads status "PAID".
        if (details.paidAt) { clearCart(); clearPendingPayment(); return; }
        if (details.status === "FAILED" || details.status === "CANCELLED") clearPendingPayment();
      })
      .catch(() => { /* a network problem says nothing about the payment; keep the basket */ })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);
  return null;
}
