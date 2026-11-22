import { parsePhoneNumberFromString } from "libphonenumber-js";
import { resolveGateway, type MainGateway, type ResolvedGateway } from "../payment-gateway";
import { normalizeCurrencyCode } from "../exchange/convert";
export type RoutingSnapshot = { version: 1; gateway: ResolvedGateway; reason: "SA_IP" | "SA_PHONE" | "SA_IP_AND_PHONE" | "TRY" | "DEFAULT" | "DONOR_OVERRIDE" | "COUNTRY_RULE"; ruleCountry?: string; ipCountry: string | null; phoneCountry: string | null; trialMatched: boolean; changedGateway: boolean; currency: string; at: string };
export function routingPhoneCountry(value: unknown): string | null {
 if (typeof value !== "string" || value.length > 80) return null;
 const digits = value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= "۰" ? 1776 : 1632))).replace(/[\s().-]/g, "").replace(/^00/, "+");
 if (!/^\+\d{7,15}$/.test(digits)) return null;
 try { const p = parsePhoneNumberFromString(digits); return p?.isValid() ? p.country ?? null : null; } catch { return null; }
}
/** Gateways an administrator can pin (see donor-gateway-override.ts). */
export type DonorGatewayOverride = "PAYFOR" | "ALBARAKA";
/** "Donors from this country use this gateway", matched by phone, IP, or either. */
export type CountryGatewayRule = { country: string; gateway: DonorGatewayOverride; matchBy: "ANY" | "IP" | "PHONE" };
export function decideNewCardRoute(input: { mainGateway: MainGateway; payforEnabled: boolean; saudiEnabled: boolean; currency: string; phone?: unknown; ipCountry?: string | null; donationType?: "ONE_TIME" | "DAILY" | "FRIDAY" | "MONTHLY"; donorOverride?: DonorGatewayOverride | null; countryRules?: readonly CountryGatewayRule[] | null; now?: Date }): RoutingSnapshot {
 const currency = normalizeCurrencyCode(input.currency), type = input.donationType ?? "ONE_TIME";
 const baseline = resolveGateway({ mainGateway: input.mainGateway, payforEnabled: input.payforEnabled, currency, donationType: type });
 const ipCountry = /^[A-Z]{2}$/.test(input.ipCountry ?? "") ? input.ipCountry! : null, phoneCountry = routingPhoneCountry(input.phone);
 const saIp = ipCountry === "SA", saPhone = phoneCountry === "SA";
 const trialMatched = type === "ONE_TIME" && input.payforEnabled && input.saudiEnabled && (saIp || saPhone);
 // Administrator routing, highest first: a pinned donor, then a country rule. Only ever to a gateway
 // that can take the payment: PayFor must be enabled; Albaraka is never forced on a Stripe site.
 const usable = (g: DonorGatewayOverride): DonorGatewayOverride | null => g === "PAYFOR" ? (input.payforEnabled ? "PAYFOR" : null) : baseline !== "STRIPE" ? "ALBARAKA" : null;
 const override = type === "ONE_TIME" && input.donorOverride ? usable(input.donorOverride) : null;
 let rule: (CountryGatewayRule & { byPhone: boolean; byIp: boolean; gateway: DonorGatewayOverride }) | null = null;
 if (!override && type === "ONE_TIME") for (const r of input.countryRules ?? []) {
  const byPhone = r.matchBy !== "IP" && phoneCountry === r.country, byIp = r.matchBy !== "PHONE" && ipCountry === r.country, g = usable(r.gateway);
  if (!g || !(byPhone || byIp)) continue;
  if (!rule || (byPhone && !rule.byPhone)) rule = { ...r, gateway: g, byPhone, byIp }; // the donor's own phone wins over where they are
 }
 // Saudi Arabia kept its historic reasons when it moved into the rule list, so reports stay continuous.
 const saudiRule = rule?.country === "SA" && rule.gateway === "PAYFOR";
 const gateway = override ?? rule?.gateway ?? (trialMatched ? "PAYFOR" : baseline);
 const reason: RoutingSnapshot["reason"] = override ? "DONOR_OVERRIDE"
  : rule ? (saudiRule ? (rule.byIp && rule.byPhone ? "SA_IP_AND_PHONE" : rule.byIp ? "SA_IP" : "SA_PHONE") : "COUNTRY_RULE")
  : trialMatched ? saIp && saPhone ? "SA_IP_AND_PHONE" : saIp ? "SA_IP" : "SA_PHONE" : baseline === "PAYFOR" && currency === "TRY" ? "TRY" : "DEFAULT"; // PayFor as main gateway is not a TRY route
 return { version: 1, gateway, reason, ...(rule ? { ruleCountry: rule.country } : {}), ipCountry, phoneCountry, trialMatched: trialMatched || (!override && saudiRule), changedGateway: gateway !== baseline, currency, at: (input.now ?? new Date()).toISOString() };
}
export function frozenPaymentRoute(raw: unknown): RoutingSnapshot | null {
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
 const route = (raw as { paymentRouting?: Partial<RoutingSnapshot> }).paymentRouting;
 return route?.version === 1 && ["PAYFOR", "ALBARAKA", "STRIPE"].includes(route.gateway ?? "") ? route as RoutingSnapshot : null;
}
