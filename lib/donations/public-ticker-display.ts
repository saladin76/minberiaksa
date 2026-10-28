export interface TickerAmountRange {
  minAmount: number;
  maxAmount: number;
  probability: number;
  label: string;
}

export interface TickerDisplayConfig {
  donorNames: string[];
  amountRanges: TickerAmountRange[];
}

export interface TickerDisplayItem {
  name: string;
  amount: number;
  categoryName: string | null;
}

/** Validate operator-entered display labels without silently clipping data. */
export function normalizeTickerDisplayNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const names: string[] = [];
  for (const valueItem of value) {
    if (typeof valueItem !== "string") return null;
    const name = valueItem.trim();
    if (!name) continue;
    if (name.length > 80) return null;
    names.push(name);
  }
  return names.length ? names : null;
}

/** Pick only from the display values explicitly configured by an operator. */
export function generateTickerDisplay(
  config: TickerDisplayConfig,
  categoryNames: string[] = [],
  random: () => number = Math.random,
): TickerDisplayItem | null {
  const names = config.donorNames.filter((name) => name.trim());
  const ranges = config.amountRanges.filter((range) =>
    Number.isFinite(range.minAmount) &&
    Number.isFinite(range.maxAmount) &&
    range.minAmount >= 0 &&
    range.maxAmount >= range.minAmount &&
    Number.isFinite(range.probability) &&
    range.probability > 0,
  );
  const totalWeight = ranges.reduce((sum, range) => sum + range.probability, 0);
  if (!names.length || !ranges.length || totalWeight <= 0) return null;

  let selection = Math.min(Math.max(random(), 0), 0.999999999) * totalWeight;
  let selectedRange = ranges[ranges.length - 1]!;
  for (const range of ranges) {
    selection -= range.probability;
    if (selection < 0) {
      selectedRange = range;
      break;
    }
  }

  const nameIndex = Math.min(names.length - 1, Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * names.length));
  const amountRoll = Math.min(Math.max(random(), 0), 0.999999999);
  const amount = Math.floor(selectedRange.minAmount + amountRoll * (selectedRange.maxAmount - selectedRange.minAmount + 1));
  const categoryIndex = categoryNames.length
    ? Math.min(categoryNames.length - 1, Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * categoryNames.length))
    : -1;

  return {
    name: names[nameIndex]!,
    amount,
    categoryName: categoryIndex >= 0 ? categoryNames[categoryIndex]! : null,
  };
}


/** First and last word only; full names never cross the public API boundary. */
export function maskTickerName(value: unknown): string {
  const words = typeof value === "string" ? value.normalize("NFC").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim().split(/\s+/u).filter(Boolean) : [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const mask = (word: string) => { const letters = [...segmenter.segment(word)].map(item => item.segment); return letters.length < 2 ? "***" : letters[0] + "***" + letters[letters.length - 1]; };
  return words.length ? [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])].map(mask).join(" ") : "***";
}
export type PublicTickerEntry = { key: string; source: "DONATION" | "COMMUNITY"; name: string; amount: number | null; currency: string | null; at: string | null };
