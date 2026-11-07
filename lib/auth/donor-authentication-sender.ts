import { prisma } from "@/lib/prisma";

/** Phone/WABA identity belongs to the selected sender, never legacy app credentials. */
export async function donorAuthenticationSender() {
  const senders = await prisma.communicationSender.findMany({
    where: { channel: "WHATSAPP", provider: "META_WHATSAPP", isDefault: true },
    select: { id: true, enabled: true, status: true, phoneNumberId: true, businessAccountId: true, supportedPurposes: true },
    take: 2,
  });
  const sender = senders[0];
  if (senders.length !== 1 || !sender.enabled || sender.status !== "ACTIVE" || !sender.phoneNumberId || !sender.businessAccountId || (sender.supportedPurposes.length > 0 && !sender.supportedPurposes.includes("AUTHENTICATION"))) throw new Error("WHATSAPP_AUTH_SENDER_NOT_READY");
  return { ...sender, phoneNumberId: sender.phoneNumberId, businessAccountId: sender.businessAccountId };
}
