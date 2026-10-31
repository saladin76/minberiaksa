import { parsePhoneNumberFromString } from "libphonenumber-js";
import { resolveGateway, type MainGateway, type ResolvedGateway } from "../payment-gateway";
import { normalizeCurrencyCode } from "../exchange/convert";
export type RoutingSnapshot = { version: 1; gateway: ResolvedGateway; reason: "SA_IP" | "SA_PHONE" | "SA_IP_AND_PHONE" | "TRY" | "DEFAULT"; ipCountry: string | null; phoneCountry: string | null; trialMatched: boolean; changedGateway: boolean; currency: string; at: string };
export function routingPhoneCountry(value: unknown): string | null {
 if (typeof value !== "string" || value.length > 80) return null;
 const digits = value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632))).replace(/[\s().-]/g, "").replace(/^00/, "+");
 if (!/^\+\d{7,15}$/.test(digits)) return null;
 try { const p = parsePhoneNumberFromString(digits); return p?.isValid() ? p.country ?? null : null; } catch { return null; }
}
export function decideNewCardRoute(input: { mainGateway: MainGateway; payforEnabled: boolean; saudiEnabled: boolean; currency: string; phone?: unknown; ipCountry?: string | null; donationType?: "ONE_TIME" | "DAILY" | "FRIDAY" | "MONTHLY"; now?: Date }): RoutingSnapshot {
 const currency = normalizeCurrencyCode(input.currency), type = input.donationType ?? "ONE_TIME";
 const baseline = resolveGateway({ mainGateway: input.mainGateway, payforEnabled: input.payforEnabled, currency, donationType: type });
 const ipCountry = /^[A-Z]{2}$/.test(input.ipCountry ?? "") ? input.ipCountry! : null, phoneCountry = routingPhoneCountry(input.phone);
 const saIp = ipCountry === "SA", saPhone = phoneCountry === "SA";
 const trialMatched = type === "ONE_TIME" && input.payforEnabled && input.saudiEnabled && (saIp || saPhone);
 const gateway = trialMatched ? "PAYFOR" : baseline;
 return { version: 1, gateway, reason: trialMatched ? saIp && saPhone ? "SA_IP_AND_PHONE" : saIp ? "SA_IP" : "SA_PHONE" : baseline === "PAYFOR" ? "TRY" : "DEFAULT", ipCountry, phoneCountry, trialMatched, changedGateway: gateway !== baseline, currency, at: (input.now ?? new Date()).toISOString() };
}
export function frozenPaymentRoute(raw: unknown): RoutingSnapshot | null {
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
 const route = (raw as { paymentRouting?: Partial<RoutingSnapshot> }).paymentRouting;
 return route?.version === 1 && ["PAYFOR", "ALBARAKA", "STRIPE"].includes(route.gateway ?? "") ? route as RoutingSnapshot : null;
}
