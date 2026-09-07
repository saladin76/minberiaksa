import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { EmailSuppressionReason } from "./providers/elastic-email/webhook-events";

/**
 * Turns an Elastic Email opt-out signal into an actual consent change.
 *
 * Before this, an `Unsubscribed` or `AbuseReport` notification only advanced the
 * delivery row for the one message that triggered it. The donor's
 * `emailNotifications` flag and their `DonorCommunicationProfile.emailOptIn`
 * were untouched, so the audience query kept selecting them and every later
 * campaign mailed someone who had explicitly opted out — the exact behaviour
 * that gets a sending domain blocked.
 *
 * Deliberately quiet on failure: this runs inside a webhook that must answer 200
 * regardless, so a missing profile or an unknown address is a no-op, never a
 * throw.
 */

export type SuppressionOutcome = {
  applied: boolean;
  userId: string | null;
  reason: EmailSuppressionReason;
};

const REASON_LABEL_AR: Record<Exclude<EmailSuppressionReason, "none">, string> = {
  unsubscribe: "ألغى الاشتراك من رسائل البريد",
  complaint: "أبلغ عن رسالة البريد كمزعجة (spam)",
  "hard-bounce": "عنوان بريده غير صالح (ارتداد دائم)",
};

export async function suppressEmailRecipient(
  email: string | null,
  reason: EmailSuppressionReason
): Promise<SuppressionOutcome> {
  const out: SuppressionOutcome = { applied: false, userId: null, reason };
  if (reason === "none") return out;

  const address = email?.trim();
  if (!address || !process.env.DATABASE_URL) return out;

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: address, mode: "insensitive" } },
      select: { id: true, name: true, emailNotifications: true },
    });
    if (!user) return out;
    out.userId = user.id;

    // A complaint is stronger than an unsubscribe: the recipient did not merely
    // opt out of marketing, they told their mailbox provider we are spam. That
    // stops every channel, not just email.
    const isComplaint = reason === "complaint";

    await prisma.user.update({
      where: { id: user.id },
      data: { emailNotifications: false },
    });

    // The profile is the audience layer's source of truth; upsert because a
    // donor who never opened the dashboard may not have one yet.
    await prisma.donorCommunicationProfile
      .upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email: address,
          emailOptIn: false,
          smsOptIn: false,
          whatsappOptIn: false,
          doNotContact: isComplaint,
          consentSource: `elastic-email:${reason}`,
          lastConsentAt: new Date(),
        },
        update: {
          emailOptIn: false,
          ...(isComplaint ? { doNotContact: true } : {}),
          consentSource: `elastic-email:${reason}`,
          lastConsentAt: new Date(),
        },
      })
      .catch((error) => {
        console.error("suppressEmailRecipient: profile upsert failed", error);
      });

    // Attributed to the donor, not to SYSTEM — the donor is who performed this,
    // and it belongs in their activity trail where the team can see it.
    await writeAuditLog({
      actorId: user.id,
      actorName: user.name ?? address,
      actorRole: "DONOR",
      action: "communication.email.suppressed",
      messageAr: `${user.name ?? address} ${REASON_LABEL_AR[reason]}`,
      messageEn: `Email suppressed for ${address} (${reason})`,
      entityType: "User",
      entityId: user.id,
      metadata: { reason, email: address, externalCall: false },
      stream: "DONOR",
    });

    out.applied = true;
    return out;
  } catch (error) {
    console.error("suppressEmailRecipient failed", error);
    return out;
  }
}
