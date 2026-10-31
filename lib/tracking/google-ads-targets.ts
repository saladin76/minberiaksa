export type GoogleAdsTarget = { conversionId: string; conversionLabel: string };
export function normalizeAdsConversionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toUpperCase();
  return /^(?:AW-)?\d+$/.test(raw) ? "AW-" + raw.replace(/^AW-/, "") : null;
}
export function googleAdsTargets(config: {
  googleAdsTargets?: GoogleAdsTarget[];
  googleAdsConversionId?: string | null;
  googleAdsConversionLabel?: string | null;
}): GoogleAdsTarget[] {
  const rows = config.googleAdsTargets ?? [
      {
        conversionId: config.googleAdsConversionId || "",
        conversionLabel: config.googleAdsConversionLabel || "",
      },
    ],
    seen = new Set<string>();
  return rows.flatMap((row) => {
    const id = normalizeAdsConversionId(row.conversionId),
      label = row.conversionLabel?.trim();
    if (!id || !label || !/^[\w-]{1,200}$/.test(label)) return [];
    const key = id + "/" + label;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ conversionId: id, conversionLabel: label }];
  });
}
