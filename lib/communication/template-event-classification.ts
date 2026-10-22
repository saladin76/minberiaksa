import { prisma } from "@/lib/prisma";
import { resolveTemplateKind } from "./template-kind";

/** Include disabled bindings: pausing an event does not make its template marketing. */
export async function classifyEventTemplates<T extends { id: string; kind?: string | null; purpose?: string | null; category?: string | null }>(
  channel: "EMAIL" | "WHATSAPP" | "SMS", templates: T[],
) {
  const triggers = await prisma.messageTrigger.findMany({
    where: { channel },
    select: { templateId: true },
  });
  const linkedIds = new Set(triggers.map((trigger) => trigger.templateId));
  return templates.map((template) => ({
    ...template,
    kind: resolveTemplateKind(template, linkedIds.has(template.id)),
    linkedToEvent: linkedIds.has(template.id),
  }));
}
