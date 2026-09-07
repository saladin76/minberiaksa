import { NextResponse } from "next/server";
import {
  loadRatesFromDatabase,
  refreshExchangeRatesFromApi,
} from "@/lib/exchange/rates-service";

/**
 * Public read-only exchange rates (USD base). Populated from DB; bootstraps from API if empty.
 * Clients should use this instead of calling ExchangeRate-API directly.
 */
export async function GET() {
  try {
    let row = await loadRatesFromDatabase();
    if (!row) {
      await refreshExchangeRatesFromApi();
      row = await loadRatesFromDatabase();
    }
    if (!row) {
      return NextResponse.json(
        { error: "Exchange rates unavailable", result: "error" },
        { status: 503 }
      );
    }

    const updatedIso = row.fetchedAt.toISOString();
    return NextResponse.json(
      {
        result: "success",
        base_code: "USD",
        conversion_rates: row.rates,
        rates: row.rates,
        time_last_update_utc: updatedIso,
        updatedAt: updatedIso,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3300",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/exchange/rates]", e);
    return NextResponse.json(
      { error: "Failed to load exchange rates", result: "error" },
      { status: 503 }
    );
  }
}
