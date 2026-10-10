import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import type { EmailSuppressionReason } from "./providers/elastic-email/webhook-events";
import { recordEmailSuppression, type GlobalEmailSuppressionReason } from "./email-suppression-store";
import { ensureProfilesForUsers } from "./donor-communication-profile-service";

/**
 * Turns an Elastic Email opt-out signal into an actual consent change.
 *
 * Before this, an `Unsubscribed` or `AbuseReport` notification only advanced the
 * delivery row for the one message that triggered it. The donor's
 * `emailNotifications` flag and their `DonorCommunicationProfile.emailOptIn`
 * were untouched, so the audience query kept selecting them and every later
 * campaign mailed someone who had explicitly opted out  the exact behaviour
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

  const address = email?.trim().toLowerCase();
  if (!address || !process.env.DATABASE_URL) return out;

  const globalReason: GlobalEmailSuppressionReason =
    reason === "complaint" ? "COMPLAINT" : reason === "hard-bounce" ? "HARD_BOUNCE" : "UNSUBSCRIBE";

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: address, mode: "insensitive" } },
      select: { id: true, name: true, emailNotifications: true },
    });
    const globallySuppressed = await recordEmailSuppression({
      email: address,
      reason: globalReason,
      source: `elastic-email:${reason}`,
      userId: user?.id ?? null,
    });
    out.applied = globallySuppressed;
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
    out.applied = true;

    // Bootstrap a missing profile through the canonical profile service first so
    // SMS/WhatsApp preferences are preserved from their own sources. An email
    // unsubscribe or hard bounce must change email only; only a complaint sets
    // the global do-not-contact flag.
    await ensureProfilesForUsers([user.id]);
    await prisma.donorCommunicationProfile
      .update({
        where: { userId: user.id },
        data: {
          email: address,
          emailOptIn: false,
          ...(isComplaint ? { doNotContact: true } : {}),
          consentSource: `elastic-email:${reason}`,
          lastConsentAt: new Date(),
        },
      })
      .catch((error) => {
        console.error("suppressEmailRecipient: profile update failed", error);
      });

    // Attributed to the donor, not to SYSTEM  the donor is who performed this,
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
