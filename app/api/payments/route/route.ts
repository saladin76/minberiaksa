import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { resolveNewCardPaymentRoute } from "@/lib/donations/payment-routing-server";
import { getUsdBaseRatesForServer } from "@/lib/exchange/rates-service";
import { convertAmountInCurrencyToTry } from "@/lib/exchange/convert";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
/** Preview only. The order writer repeats the decision and freezes it before charging. */
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 if (!body || typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency) || body.phone != null && (typeof body.phone !== "string" || body.phone.length > 80) || body.amount != null && (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0)) return NextResponse.json({ error: "Invalid payment preview" }, { status: 400, headers });
 try {
  const session = await getServerSession(authOptions);
  const route = await resolveNewCardPaymentRoute(request.headers, { method: "CARD", type: "ONE_TIME", currency: body.currency, phone: body.phone, userId: session?.user?.id });
  const quote = route?.gateway === "PAYFOR" && body.amount ? { amountTRY: convertAmountInCurrencyToTry(body.amount, body.currency, await getUsdBaseRatesForServer()), originalAmount: body.amount, originalCurrency: body.currency } : null;
  return NextResponse.json({ gateway: route?.gateway, quote }, { headers });
 } catch { return NextResponse.json({ error: "Payment preview unavailable" }, { status: 503, headers }); }
}
