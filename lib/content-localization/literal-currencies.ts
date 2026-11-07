/** Currency codes are identifiers, including in CJK prose; never localize USD to 美元. */
export function literalCurrencies(source: string[]) {
  let prefix = "⟦KEEP_CURRENCY_";
  while (source.some(text => text.includes(prefix))) prefix += "X";
  const values = new Map<string, string>();
  const protect = (text: string) => text.replace(/\b(?:USD|EUR|TRY|SAR|AED|QAR|KWD|JOD|GBP)\b/gi, code => {
    const marker = `${prefix}${values.size.toString(36).toUpperCase()}⟧`;
    values.set(marker, code);
    return marker;
  });
  const restore = (text: string) => { for (const [marker, code] of values) text = text.split(marker).join(code); return text; };
  return { protect, restore };
}
