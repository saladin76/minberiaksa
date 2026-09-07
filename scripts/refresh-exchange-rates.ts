/**
 * Manually refresh exchange rates in the database (same as hourly cron).
 * Run: npx tsx scripts/refresh-exchange-rates.ts
 * Requires DATABASE_URL and EXCHANGE_RATE_API_KEY.
 */
import { refreshExchangeRatesFromApi } from "../lib/exchange/rates-service";
import { prisma } from "../lib/prisma";

async function main() {
  const n = Object.keys(await refreshExchangeRatesFromApi()).length;
  console.log(`OK — stored ${n} currency rates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
