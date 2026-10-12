/**
 * Client-side card checks, run before an order exists.
 *
 * The server checks the same things (`lib/albaraka.ts`), but by then the
 * donation row is already written, so every typo used to leave a FAILED row and
 * show the server's English reason on an Arabic page. These catch the common
 * mistakes first and name them in the donor's language.
 */
export type CardFieldError = "invalidCardNumber" | "invalidCardExpiry" | "invalidCardCvc";

/** Luhn check over 12–19 digits. */
export function passesLuhn(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) return false;
  let sum = 0;
  for (let i = 0; i < pan.length; i++) {
    let d = Number(pan[pan.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** "MM/YY" (or "MMYY"): a real month, not before the current one. */
export function isFutureExpiry(mmyy: string, now: Date = new Date()): boolean {
  const digits = mmyy.replace(/\D/g, "");
  if (digits.length !== 4) return false;
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2, 4));
  if (month < 1 || month > 12) return false;
  return now.getTime() < Date.UTC(year, month, 1);
}

export function checkCardFields(number: string, expiry: string, cvc: string): CardFieldError | null {
  if (!passesLuhn(number.replace(/\D/g, ""))) return "invalidCardNumber";
  if (!isFutureExpiry(expiry)) return "invalidCardExpiry";
  if (!/^\d{3,4}$/.test(cvc)) return "invalidCardCvc";
  return null;
}
