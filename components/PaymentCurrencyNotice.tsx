"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ResolvedGateway } from "@/lib/payment-gateway";
export function PaymentCurrencyNotice({ gateway, currency, amount, phone = "" }: { gateway: ResolvedGateway; currency: string; amount: number; phone?: string }) {
 const t = useTranslations("DonationDialog"), locale = useLocale();
 const enabled = gateway === "PAYFOR" && currency !== "TRY" && amount > 0;
 const key = JSON.stringify([currency, amount, phone]);
 const [quote, setQuote] = useState<{ key: string; amount: number } | null>(null);
 useEffect(() => {
  if (!enabled) return;
  const controller = new AbortController();
  const timer = setTimeout(() => {
   void fetch("/api/payments/route", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ currency, amount, phone }) }).then(async response => {
    const result = await response.json();
    if (response.ok && result.gateway === "PAYFOR" && typeof result.quote?.amountTRY === "number" && !controller.signal.aborted) setQuote({ key, amount: result.quote.amountTRY });
   }).catch(() => undefined);
  }, 250);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [enabled, key, currency, amount, phone]);
 if (!enabled) return null;
 const format = (value: number, code: string) => new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
 return <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{quote?.key === key ? t("bankChargeEstimate", { original: format(amount, currency), amount: format(quote.amount, "TRY") }) : t("bankChargeCurrency")}</p>;
}
