import crypto from "crypto";

/**
 * A guest donor's key to their own donation.
 *
 * A donation id is an identifier: it appears in URLs, browser history,
 * forwarded emails, screenshots and support threads, and none of those is a
 * place a secret belongs. It used to be the only thing standing between a
 * guest and a donation's success page, receipt, certificates and donor
 * details (`DEPLOYED_VS_DESIGN_AUDIT.md` § P1.2). Now every donation is
 * minted a separate high-entropy token at creation (`lib/prisma.ts` adds it
 * to every `donation.create`), every link handed to a guest carries it as
 * `?t=`, and the document endpoints compare it in constant time. A signed-in
 * owner, or a revenue user, is let in by their session and never needs it —
 * the same model the bank-transfer receipt page already used.
 */

/** 24 random bytes as hex: 48 characters, 192 bits. */
export function mintDonationAccessToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/* The link helpers live in a crypto-free module so client components can
   use them; re-exported here so server code has one import. */
export { DONATION_TOKEN_PARAM, withDonationToken } from "./access-token-link";

/** Constant-time match; anything short, empty or absent never matches. */
export function donationTokenMatches(expected: string | null | undefined, presented: string | null | undefined): boolean {
  if (!expected || !presented || expected.length < 32 || presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(presented, "utf8"));
}

