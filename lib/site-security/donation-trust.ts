import { createHmac, timingSafeEqual } from "node:crypto";
/**
 * "Trusted device" mark: issued only after a verified PAID donation (success page),
 * HMAC-signed so a bot cannot forge it. Contains no personal data.
 */
export const TRUST_COOKIE = "mdg_trust";
export const TRUST_TTL_DAYS = 365;
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update("mdg-trust:" + payload).digest("base64url");

export function issueTrustMark(now: number, secret: string): string {
  if (!secret || secret.length < 20) throw new Error("TRUST_KEY_UNAVAILABLE");
  const payload = b64(JSON.stringify({ v: 1, exp: now + TRUST_TTL_DAYS * 864e5 }));
  return payload + "." + sign(payload, secret);
}
export function verifyTrustMark(value: string | undefined | null, now: number, secret: string | undefined): boolean {
  if (!value || !secret || secret.length < 20 || value.length > 300) return false;
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra !== undefined) return false;
  const expected = Buffer.from(sign(payload, secret)), got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data?.v === 1 && typeof data.exp === "number" && data.exp > now;
  } catch { return false; }
}
