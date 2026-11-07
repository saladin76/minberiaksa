import crypto from "node:crypto";

/** An item-scoped gift link never grants access to the donor's receipt or contacts. */
export function giftCertificateToken(itemId: string, donationId: string, donationAccessToken: string | null): string | null {
  const secret = donationAccessToken || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(`gift-certificate:v1:${donationId}:${itemId}`).digest("hex");
}

export function giftCertificateTokenMatches(expected: string | null, presented: string | null): boolean {
  if (!expected || !presented || !/^[a-f0-9]{64}$/.test(presented)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(presented));
}
