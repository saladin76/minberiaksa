import "server-only";
import { prisma } from "../prisma";
import { parseMainGateway } from "../payment-gateway";
import { decideNewCardRoute } from "./payment-routing";
import { paymentRoutingCountry } from "./payment-routing-country";
export async function resolveNewCardPaymentRoute(headers: Pick<Headers, "get">, input: { method: unknown; type: unknown; currency: string; phone?: unknown; userId?: string | null }) {
 if (input.method !== "CARD" || input.type !== "ONE_TIME") return null;
 const settings = await prisma.globalSettings.findFirst({ orderBy: { createdAt: "asc" }, select: { mainGateway: true, payforEnabled: true, payforSaudiRoutingEnabled: true } });
 let phone = input.phone, ipCountry: string | null = null;
 if (settings?.payforSaudiRoutingEnabled && settings.payforEnabled !== false) {
  if ((!phone || typeof phone !== "string" || !phone.trim()) && input.userId) phone = (await prisma.user.findUnique({ where: { id: input.userId }, select: { phone: true } }))?.phone;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { ipCountry = await Promise.race([paymentRoutingCountry(headers).catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1200); })]); }
  finally { if (timer) clearTimeout(timer); }
 }
 return decideNewCardRoute({ mainGateway: parseMainGateway(settings?.mainGateway), payforEnabled: settings?.payforEnabled !== false, saudiEnabled: settings?.payforSaudiRoutingEnabled === true, currency: input.currency, phone, ipCountry });
}
