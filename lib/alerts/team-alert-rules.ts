/**
 * Team alerts (owner, 2026-11-22: Albaraka answered E999 for 7.5 hours before anyone noticed). Pure rules, no I/O:
 * which situations deserve a WhatsApp message to the team. The cron route reads the data and sends.
 */
export type Attempt = { provider: string; status: string; code: string | null; message: string | null; at: Date };

/** Bank answers that mean the gateway itself is failing — not the donor's card (funds, limits, fraud checks). */
export function isSystemFailure(a: Pick<Attempt, "code" | "message">): boolean {
  const code = String(a.code ?? "").trim().toUpperCase();
  if (/^E\d+/.test(code) || ["91", "96", "98", "99"].includes(code)) return true;
  return /genel hata|system error|sistem hatas|timeout|zaman aşımı|bağlantı|connection|unavailable/i.test(String(a.message ?? ""));
}

/** A gateway is down when its last 3 attempts that reached the bank all failed for system reasons. */
export function gatewayOutage(attempts: Attempt[], provider: string, streak = 3): { down: boolean; since: Date | null; count: number; sample: string } {
  const mine = attempts.filter((a) => a.provider === provider && (a.code || a.message)).sort((x, y) => y.at.getTime() - x.at.getTime());
  const head = mine.slice(0, streak);
  if (head.length < streak || !head.every((a) => a.status === "FAILED" && isSystemFailure(a))) return { down: false, since: null, count: 0, sample: "" };
  let n = 0; while (n < mine.length && mine[n].status === "FAILED" && isSystemFailure(mine[n])) n++;
  const first = mine[n - 1];
  return { down: true, since: first.at, count: n, sample: `${first.code ?? ""} ${first.message ?? ""}`.trim() };
}

/** Recovered once the gateway confirms a payment after the outage began. */
export function gatewayRecovered(attempts: Attempt[], provider: string, since: Date): boolean {
  return attempts.some((a) => a.provider === provider && a.status === "PAID" && a.at > since);
}

/** No confirmed donation for 2 h between 09:00 and 23:00 Istanbul, on a day that normally has donations then. */
export function donationsStopped(lastPaidAt: Date | null, now: Date, usualPerTwoHours: number): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(now));
  if (hour < 9 || hour >= 23 || usualPerTwoHours < 2) return false;
  return !lastPaidAt || now.getTime() - lastPaidAt.getTime() >= 2 * 3600_000;
}

export function istanbulTime(d: Date): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(d);
}
