import "server-only";

import { prisma } from "@/lib/prisma";
import type { CommunicationPurposeId } from "./communication-runtime-types";

export type GlobalEmailSuppressionReason = "UNSUBSCRIBE" | "HARD_BOUNCE" | "COMPLAINT";
export type GlobalEmailSuppressionScope = "MARKETING" | "ALL";

function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export async function recordEmailSuppression(input: {
  email: string;
  reason: GlobalEmailSuppressionReason;
  source?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const email = normalizeEmail(input.email);
  if (!email) return false;
  const scope: GlobalEmailSuppressionScope = input.reason === "UNSUBSCRIBE" ? "MARKETING" : "ALL";
  try {
    const existing = await prisma.emailSuppression.findFirst({ where: { email }, select: { id: true } });
    if (existing) {
      await prisma.emailSuppression.update({
        where: { id: existing.id },
        data: { reason: input.reason, scope, source: input.source ?? null, userId: input.userId ?? null },
      });
    } else {
      await prisma.emailSuppression.create({
        data: { email, reason: input.reason, scope, source: input.source ?? null, userId: input.userId ?? null },
      });
    }
    return true;
  } catch (error) {
    console.error("recordEmailSuppression failed", error);
    return false;
  }
}

export type EmailSuppressionDecision =
  | { allowed: true }
  | { allowed: false; reason: GlobalEmailSuppressionReason; scope: GlobalEmailSuppressionScope };

export async function emailSuppressionDecision(
  emailInput: string | null | undefined,
  purpose: CommunicationPurposeId | string | null | undefined,
): Promise<EmailSuppressionDecision> {
  if (!process.env.DATABASE_URL) return { allowed: true };
  const email = normalizeEmail(emailInput);
  if (!email) return { allowed: true };
  try {
    const row = await prisma.emailSuppression.findFirst({ where: { email }, select: { reason: true, scope: true } });
    if (!row) return { allowed: true };
    const reason = row.reason as GlobalEmailSuppressionReason;
    const scope = row.scope as GlobalEmailSuppressionScope;
    if (scope === "ALL") return { allowed: false, reason, scope };
    if (String(purpose ?? "").toUpperCase() === "MARKETING") return { allowed: false, reason, scope };
    return { allowed: true };
  } catch (error) {
    console.error("emailSuppressionDecision failed", error);
    return String(purpose ?? "").toUpperCase() === "MARKETING"
      ? { allowed: false, reason: "UNSUBSCRIBE", scope: "MARKETING" }
      : { allowed: true };
  }
}
