import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorizationValid } from "@/lib/communication/cron-auth";
import { refreshExchangeRatesFromApi } from "@/lib/exchange/rates-service";

/**
 * Hourly refresh of USD-base rates from ExchangeRate-API into MongoDB.
 * Configure: Vercel Cron (see vercel.json) or any scheduler calling:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/exchange-rates
 */
export async function GET(request: NextRequest) {
  try {
    // Fails CLOSED: the previous `if (cronSecret && ...)` form skipped the check entirely
    // whenever CRON_SECRET was unset, leaving the endpoint fully public in that environment.
    if (!isCronAuthorizationValid(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rates = await refreshExchangeRatesFromApi();
    const count = Object.keys(rates).length;
    return NextResponse.json({
      ok: true,
      currencies: count,
      message: "Exchange rates refreshed",
    });
  } catch (e) {
    console.error("[cron/exchange-rates]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
