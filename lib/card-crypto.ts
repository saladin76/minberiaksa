import crypto from "crypto";
import bcrypt from "bcryptjs";

const ALGO = "aes-256-cbc";

function getKey(): Buffer {
  const raw = process.env.CARD_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "fallback-dev-key-32-chars-padded!";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptCard(plain: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptCard(stored: string): string {
  const [ivHex, dataHex] = stored.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function hashCvc(cvc: string): Promise<string> {
  return bcrypt.hash(cvc, 10);
}

export async function verifyCvc(cvc: string, hash: string): Promise<boolean> {
  return bcrypt.compare(cvc, hash);
}

/** Detect card brand from first digit / BIN */
export function detectCardType(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return "mastercard";
  if (/^3[47]/.test(n)) return "amex";
  if (/^9792/.test(n) || /^65/.test(n)) return "troy";
  if (/^6/.test(n)) return "discover";
  return "unknown";
}

/** Returns last 4 digits from a decrypted card number */
export function maskCardNumber(cardNumber: string): string {
  const n = cardNumber.replace(/\s/g, "");
  return "**** **** **** " + n.slice(-4);
}
