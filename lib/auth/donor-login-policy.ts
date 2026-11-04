import { createHmac, randomInt, randomBytes } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type LoginChannel = "EMAIL" | "WHATSAPP";
export function loginContact(channel: LoginChannel, input: string): string {
  const value = input.trim();
  if (channel === "EMAIL") {
    if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("INVALID_CONTACT");
    return value.toLowerCase();
  }
  const international = value.startsWith("00") ? `+${value.slice(2)}` : value.startsWith("+") ? value : `+${value}`;
  const phone = parsePhoneNumberFromString(international);
  if (!phone?.isValid()) throw new Error("INVALID_CONTACT");
  return phone.number;
}
export function loginHash(value: string): string {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("AUTH_NOT_CONFIGURED");
  return createHmac("sha256", key).update(value).digest("hex");
}
export const identityKey = (channel: LoginChannel, contact: string) => `${channel}:${contact}`;
export const newLoginCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
export const newLoginTicket = () => randomBytes(32).toString("hex");
export function donorMayBeClaimedByPhone(user: { role: string; password: string | null; emailVerified: Date | null; registeredAt: Date | null; accounts: unknown[] }): boolean {
  return user.role === "DONOR" && !user.password && !user.emailVerified && !user.registeredAt && user.accounts.length === 0;
}
