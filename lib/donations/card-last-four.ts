const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function cardLastFour(value: unknown): string | null {
  if (typeof value !== "string" || !/^[\d\s*Xx•-]+$/.test(value.trim())) return null;
  const compact = value.replace(/[\s-]/g, "");
  if (/^\d{4}$/.test(compact)) return compact;
  if (/^\d{13,19}$/.test(compact)) return compact.slice(-4);
  return /^[\d*Xx•]{1,21}\d{4}$/.test(compact) && /[*Xx•]/.test(compact) ? compact.slice(-4) : null;
}

/** Read only card-specific fields. Never infer digits from order IDs or CVCs. */
export function donationCardLastFour(input: { providerRaw?: unknown; legacyPan?: unknown; maskedPan?: unknown; encryptedPan?: string | null }, decrypt?: (value: string) => string): string | null {
  const raw = record(input.providerRaw);
  const direct = cardLastFour(record(raw.cardSummary).last4) || cardLastFour(input.maskedPan) || cardLastFour(input.legacyPan);
  if (direct) return direct;
  const search = (value: unknown, depth: number): string | null => {
    if (depth > 5 || !value || typeof value !== "object") return null;
    for (const [key, child] of Object.entries(value)) {
      if (/^(masked_?pan|masked_?card_?(?:no|number)|card_?last_?4|card_?no|pan)$/i.test(key)) {
        const last = cardLastFour(child); if (last) return last;
      }
      if (typeof child === "object") { const found = search(child, depth + 1); if (found) return found; }
    }
    return null;
  };
  const provider = search(raw, 0); if (provider) return provider;
  if (input.encryptedPan && decrypt) { try { return cardLastFour(decrypt(input.encryptedPan)); } catch {} }
  return null;
}
