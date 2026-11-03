/** Bank exports use wall-clock dates. Preserve them without server timezone
 * conversion, and reject impossible calendar dates rather than normalizing. */
export function statementDate(
  value: unknown,
): { date: string; at: string | null } | null {
  const text =
    value instanceof Date
      ? value.toISOString().replace("Z", "")
      : String(value ?? "").trim();
  const iso = text.match(
    /^(19\d{2}|20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  const local = text.match(
    /^(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!iso && !local) return null;
  const m = (iso ?? local)!;
  const year = Number(iso ? m[1] : m[3]),
    month = Number(m[2]),
    day = Number(iso ? m[3] : m[1]);
  const hour = Number(m[4] ?? 0),
    minute = Number(m[5] ?? 0),
    second = Number(m[6] ?? 0);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    date,
    at:
      m[4] === undefined
        ? null
        : `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`,
  };
}
export function statementCurrency(
  value: unknown,
): "TRY" | "USD" | "EUR" | null {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();
  if (/(?:^|[^A-Z])(?:TRY|TL)(?:$|[^A-Z])|₺/.test(text)) return "TRY";
  if (/(?:^|[^A-Z])USD(?:$|[^A-Z])|\$/.test(text)) return "USD";
  if (/(?:^|[^A-Z])EUR(?:$|[^A-Z])|€/.test(text)) return "EUR";
  return null;
}
export function validIbanText(value: unknown): string | null {
  const match = String(value ?? "").match(/\bTR(?:[ \t]*\d){24}\b/i);
  return match ? match[0].replace(/[ \t]/g, "").toUpperCase() : null;
}
