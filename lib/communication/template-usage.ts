import { prisma } from "@/lib/prisma";
import type { CommunicationChannelId } from "./communication-runtime-types";
import { resolveTemplateKind } from "./template-kind";

export async function findClassifiedTemplate(channel: CommunicationChannelId, id: string) {
  const query = { where: { id } };
  const template = channel === "EMAIL" ? await prisma.emailTemplate.findUnique(query)
    : channel === "SMS" ? await prisma.smsTemplate.findUnique(query)
    : await prisma.whatsappTemplate.findUnique(query);
  if (!template) return null;
  const linkedToEvent = await prisma.messageTrigger.count({ where: { channel, templateId: id } }) > 0;
  return { ...template, kind: resolveTemplateKind(template, linkedToEvent), linkedToEvent };
}

/** Check all references, including disabled events and historical deliveries. Fail closed on DB errors. */
export async function templateInUse(channel: CommunicationChannelId, id: string) {
  const counts = await Promise.all([
    prisma.messageTrigger.count({ where: { channel, templateId: id } }),
    prisma.communicationCampaign.count({ where: { channel, templateGroupId: id } }),
    prisma.communicationDelivery.count({ where: { channel, templateId: id } }),
  ]);
  return counts.some((count) => count > 0);
}

/** Existing bindings own a legacy template's classification, regardless of stored historical kind. */
export async function templateKindChangeBlocked(channel: CommunicationChannelId, id: string, kind: "SYSTEM" | "CAMPAIGN") {
  if (kind === "CAMPAIGN") return await prisma.messageTrigger.count({ where: { channel, templateId: id } }) > 0;
  return await prisma.communicationCampaign.count({ where: { channel, templateGroupId: id } }) > 0;
}

/** Removing or moving an event binding must not turn its legacy template into marketing. */
export async function retainAutomaticTemplateKind(channel: CommunicationChannelId, id: string) {
  const query = { where: { id }, data: { kind: "SYSTEM" } };
  if (channel === "EMAIL") await prisma.emailTemplate.updateMany(query);
  else if (channel === "SMS") await prisma.smsTemplate.updateMany(query);
  else await prisma.whatsappTemplate.updateMany(query);
}
