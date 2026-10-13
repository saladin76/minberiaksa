import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_EXPIRY_HOURS = 24;
const AUTO_SIGN_IN_EXPIRY_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;

/** Generate a cryptographically random 64-char hex verification token. */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a new verification token, invalidating any previous unused ones for
 * this email+purpose.
 *
 * `payload` rides on the token until it is used (see `OtpCode.payload`).
 * Left out, the payload of the token being replaced carries over, so a
 * resent link still applies what the first one would have.
 */
export async function createVerificationToken(
  email: string,
  purpose = "VERIFY_EMAIL",
  expiryMinutes?: number,
  payload?: string | null
): Promise<string> {
  if (payload === undefined) {
    const previous = await prisma.otpCode.findFirst({
      where: { email, purpose, used: false },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    payload = previous?.payload ?? null;
  }

  // Invalidate all previous tokens for this email+purpose
  await prisma.otpCode.updateMany({
    where: { email, purpose, used: false },
    data: { used: true },
  });

  const token = generateVerificationToken();
  const minutes = expiryMinutes ?? TOKEN_EXPIRY_HOURS * 60;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.otpCode.create({
    data: { email, code: token, purpose, expiresAt, payload },
  });

  return token;
}

/** Create a short-lived (15 min) one-time auto-sign-in token for post-email-verification. */
export async function createAutoSignInToken(email: string): Promise<string> {
  return createVerificationToken(email, "AUTO_SIGN_IN", AUTO_SIGN_IN_EXPIRY_MINUTES);
}

type VerifyResult =
  | { success: true; payload: string | null }
  | { success: false; error: "INVALID" | "EXPIRED" | "NOT_FOUND" };

/** Verify a token for an email+purpose. Marks it as used on success. */
export async function verifyToken(
  email: string,
  token: string,
  purpose = "VERIFY_EMAIL"
): Promise<VerifyResult> {
  const record = await prisma.otpCode.findFirst({
    where: { email, purpose, used: false },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { success: false, error: "NOT_FOUND" };
  if (new Date() > record.expiresAt) return { success: false, error: "EXPIRED" };
  if (record.code !== token) return { success: false, error: "INVALID" };

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { used: true },
  });

  return { success: true, payload: record.payload ?? null };
}

/** Returns whether a resend is allowed, and how many seconds remain if not. */
export async function canResendToken(
  email: string,
  purpose = "VERIFY_EMAIL"
): Promise<{ allowed: boolean; waitSeconds: number }> {
  const latest = await prisma.otpCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) return { allowed: true, waitSeconds: 0 };

  const elapsed = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
  if (elapsed >= RESEND_COOLDOWN_SECONDS) return { allowed: true, waitSeconds: 0 };

  return {
    allowed: false,
    waitSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
  };
}

// Backward-compat aliases used by existing route files
export const createOtpRecord = createVerificationToken;
export const canResendOtp = canResendToken;
export const verifyOtpCode = verifyToken;
