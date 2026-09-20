/**
 * The waqf units and their fixed prices — `Minbar/الأوقاف.dc.html`.
 *
 *   • a waqf **share** (سهم وقفي) = $100
 *   • a waqf **metre** (متر وقفي) = $1,500 — fifteen shares
 *
 * Shared by the page that sells them and the order API that prices them, so
 * the number the donor saw and the number they are charged come from one
 * place. Pure: no server or browser dependency.
 */

export type WaqfUnitKey = "share" | "meter";

export const WAQF_UNIT_PRICE_USD: Record<WaqfUnitKey, number> = {
  share: 100,
  meter: 1500,
};

/** A single order line may hold at most this many units — the picker's ceiling. */
export const WAQF_MAX_COUNT = 999;

export function isWaqfUnitKey(value: unknown): value is WaqfUnitKey {
  return value === "share" || value === "meter";
}
