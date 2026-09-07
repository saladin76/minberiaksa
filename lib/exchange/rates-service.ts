/**
 * USD-base exchange rates: persisted in MongoDB, refreshed from ExchangeRate-API on a schedule.
 * All server conversions read from DB (with short in-memory TTL) — not the external API per request.
 */

import { prisma } from "@/lib/prisma";

export const EXCHANGE_SNAPSHOT_KEY = "usd_latest";

const BASE = "USD";
const MEM_TTL_MS = 45_000;

let memoryRates: { rates: Record<string, number>; fetchedAt: number } | null = null;

function apiKey(): string {
  const k = process.env.EXCHANGE_RATE_API_KEY?.trim();
  if (!k) throw new Error("EXCHANGE_RATE_API_KEY is not set");
  return k;
}

function coerceRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
  }
  if (!out.USD) out.USD = 1;
  return out;
}

/** Fetch from ExchangeRate-API (server only; used by cron and bootstrap). */
export async function fetchRatesFromExternalApi(): Promise<{
  rates: Record<string, number>;
  timeLastUpdateUtc: string;
}> {
  const url = `https://v6.exchangerate-api.com/v6/${apiKey()}/latest/${BASE}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Exchange rate API HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    result?: string;
    conversion_rates?: Record<string, number>;
    time_last_update_utc?: string;
  };
  if (data.result !== "success" || !data.conversion_rates) {
    throw new Error("Exchange rate API returned invalid payload");
  }
  return {
    rates: coerceRates(data.conversion_rates),
    timeLastUpdateUtc: data.time_last_update_utc ?? new Date().toISOString(),
  };
}

export async function persistExchangeRates(
  rates: Record<string, number>,
  fetchedAt: Date
): Promise<void> {
  const r = coerceRates(rates);
  await prisma.exchangeRateSnapshot.upsert({
    where: { key: EXCHANGE_SNAPSHOT_KEY },
    create: {
      key: EXCHANGE_SNAPSHOT_KEY,
      baseCode: BASE,
      rates: r as object,
      fetchedAt,
    },
    update: {
      rates: r as object,
      fetchedAt,
    },
  });
  memoryRates = null;
}

/** Call external API and save. Returns the new rates map. */
export async function refreshExchangeRatesFromApi(): Promise<Record<string, number>> {
  const { rates, timeLastUpdateUtc } = await fetchRatesFromExternalApi();
  const fetchedAt = new Date(timeLastUpdateUtc);
  await persistExchangeRates(rates, Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt);
  const out = coerceRates(rates);
  memoryRates = { rates: out, fetchedAt: Date.now() };
  return out;
}

export async function loadRatesFromDatabase(): Promise<{
  rates: Record<string, number>;
  fetchedAt: Date;
} | null> {
  const row = await prisma.exchangeRateSnapshot.findUnique({
    where: { key: EXCHANGE_SNAPSHOT_KEY },
  });
  if (!row) return null;
  const rates = coerceRates(row.rates as unknown);
  if (Object.keys(rates).length === 0) return null;
  return { rates, fetchedAt: row.fetchedAt };
}

/**
 * Rates for server-side conversion (donations, Stripe, etc.).
 * Reads DB; 45s memory cache. If no row, refreshes from API once (bootstrap).
 */
export async function getUsdBaseRatesForServer(): Promise<Record<string, number>> {
  const now = Date.now();
  if (memoryRates && now - memoryRates.fetchedAt < MEM_TTL_MS) {
    return memoryRates.rates;
  }

  const fromDb = await loadRatesFromDatabase();
  if (fromDb) {
    memoryRates = { rates: fromDb.rates, fetchedAt: now };
    return fromDb.rates;
  }

  return await refreshExchangeRatesFromApi();
}

export function convertAmountInCurrencyToTry(
  amount: number,
  fromCurrency: string,
  rates: Record<string, number>
): number {
  const from = String(fromCurrency || "USD")
    .trim()
    .toUpperCase();
  if (from === "TRY") return amount;
  const rFrom = rates[from];
  const rTry = rates.TRY;
  if (!rFrom || !rTry || rFrom <= 0 || rTry <= 0) {
    throw new Error(`Missing USD-base rate for ${from} or TRY`);
  }
  const usd = amount / rFrom;
  const tryAmount = usd * rTry;
  return Math.round(tryAmount * 100) / 100;
}
