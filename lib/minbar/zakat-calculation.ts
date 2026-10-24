import { parseAmount } from "./numeric-input";

const FIELDS = {
  cash: ["cash", "bank", "savings", "loansOut"],
  invest: ["shares", "funds", "pension", "rentIncome"],
  trade: ["stock", "receivables", "cashBiz"],
  liabilities: ["debts", "bills", "salaries"],
} as const;

/** Inputs and results use the same currency. This function never converts money. */
export function calculateZakat(
  values: Readonly<Record<string, string>>,
  goldRate: string,
  silverRate: string,
  mode: "gold" | "silver",
) {
  const amount = (raw: string | undefined) => {
    // The general amount parser removes punctuation, including a minus sign.
    // Negative assets must not become positive before clamping.
    if (/^\s*[-−]/.test(raw ?? "")) return 0;
    const value = parseAmount(raw ?? "");
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  };
  const value = (key: string) => amount(values[key]);
  const sum = (keys: readonly string[]) => keys.reduce((total, key) => total + value(key), 0);
  const gold = amount(goldRate), silver = amount(silverRate);
  const cash = sum(FIELDS.cash);
  const metals = (value("gold24") + value("gold21") * 21 / 24 + value("gold18") * 18 / 24) * gold + value("silver") * silver;
  const invest = sum(FIELDS.invest), trade = sum(FIELDS.trade), liabilities = sum(FIELDS.liabilities);
  const net = Math.max(0, cash + metals + invest + trade - liabilities);
  const nisab = mode === "gold" ? 85 * gold : 595 * silver;
  return { cash, metals, invest, trade, liabilities, net, nisab, due: nisab > 0 && net >= nisab ? net * 0.025 : 0 };
}
