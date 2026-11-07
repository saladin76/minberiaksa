"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedGateway } from "@/lib/payment-gateway";
import { normalizeCurrencyCode } from "@/lib/exchange/convert";
const valid = (v: unknown): v is ResolvedGateway => typeof v === "string" && ["PAYFOR", "ALBARAKA", "STRIPE"].includes(v);
export function usePaymentRouting({ enabled, currency, phone, fallback }: { enabled: boolean; currency: string; phone: string; fallback: ResolvedGateway }) {
 const code = normalizeCurrencyCode(currency), key = JSON.stringify([code, phone]);
 const [route, setRoute] = useState<{ key: string; gateway: ResolvedGateway } | null>(null), generation = useRef(0);
 useEffect(() => {
  const version = ++generation.current;
  if (!enabled) return;
  const controller = new AbortController();
  const timer = setTimeout(() => {
   void fetch("/api/payments/route", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ currency: code, phone }) }).then(async response => {
    const result = await response.json();
    if (response.ok && valid(result.gateway) && generation.current === version && !controller.signal.aborted) setRoute({ key, gateway: result.gateway });
   }).catch(() => undefined);
  }, 180);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [enabled, key, code, phone]);
 const acceptServerRoute = useCallback((gateway: unknown) => { if (valid(gateway)) { generation.current++; setRoute({ key, gateway }); } }, [key]);
 return { gateway: enabled && route?.key === key ? route.gateway : fallback, acceptServerRoute };
}
