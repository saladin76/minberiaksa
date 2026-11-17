import "server-only";
import { prisma } from "../prisma";
import { parseMainGateway } from "../payment-gateway";
import { decideNewCardRoute } from "./payment-routing";
import { paymentRoutingCountry } from "./payment-routing-country";
export async function resolveNewCardPaymentRoute(headers: Pick<Headers, "get">, input: { method: unknown; type: unknown; currency: string; phone?: unknown; userId?: string | null }) {
 if (input.method !== "CARD" || input.type !== "ONE_TIME") return null;
 const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { mainGateway: true, payforEnabled: true, payforSaudiRoutingEnabled: true } });
 // Administrator routing: pinned donors and country rules (Saudi Arabia moved into that list).
 // Lazy and fail-safe: null means route exactly as before, with the old Saudi setting.
 const saudiSetting = settings?.payforSaudiRoutingEnabled === true;
 const prefs = await import("./donor-gateway-override").then((m) => m.routingPreferences({ userId: input.userId ?? null, phone: input.phone, saudiSettingEnabled: saudiSetting })).catch(() => null);
 const saudiEnabled = saudiSetting && !prefs?.saudiMigrated;
 const legacySaudi = saudiEnabled && settings?.payforEnabled !== false;
 let phone = input.phone, ipCountry: string | null = null;
 if (legacySaudi || (prefs?.countryRules.length ?? 0) > 0) {
  if ((!phone || typeof phone !== "string" || !phone.trim()) && input.userId) phone = (await prisma.user.findUnique({ where: { id: input.userId }, select: { phone: true } }))?.phone;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (legacySaudi || prefs?.needsIp) try { ipCountry = await Promise.race([paymentRoutingCountry(headers).catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1200); })]); }
  finally { if (timer) clearTimeout(timer); }
 }
 return decideNewCardRoute({ mainGateway: parseMainGateway(settings?.mainGateway), payforEnabled: settings?.payforEnabled !== false, saudiEnabled, currency: input.currency, phone, ipCountry, donorOverride: prefs?.donorOverride ?? null, countryRules: prefs?.countryRules ?? null });
}
