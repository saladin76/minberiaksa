import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  MessageChannel,
  MessageTriggerEvent,
  SentMessageOrigin,
  SentMessageStatus,
} from "@prisma/client";

export interface LogSentMessageInput {
  channel: MessageChannel;
  origin: SentMessageOrigin;
  status: SentMessageStatus;
  templateId: string | null;
  templateName: string;
  triggerEvent?: MessageTriggerEvent | null;
  locale: string;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientName?: string | null;
  renderedSubject?: string | null;
  renderedBody: string;
  variables?: Prisma.InputJsonValue | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  donationId?: string | null;
}

/**
 * Best-effort write into the SentMessage log. Never throws — a failure to
 * persist the audit row must not break the send pipeline that called it.
 */
export async function logSentMessage(input: LogSentMessageInput): Promise<void> {
  try {
    await prisma.sentMessage.create({
      data: {
        channel: input.channel,
        origin: input.origin,
        status: input.status,
        templateId: input.templateId,
        templateName: input.templateName,
        triggerEvent: input.triggerEvent ?? null,
        locale: input.locale,
        recipientUserId: input.recipientUserId ?? null,
        recipientEmail: input.recipientEmail ?? null,
        recipientPhone: input.recipientPhone ?? null,
        recipientName: input.recipientName ?? null,
        renderedSubject: input.renderedSubject ?? null,
        renderedBody: input.renderedBody,
        variables:
          input.variables == null
            ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
            : input.variables,
        errorMessage: input.errorMessage ?? null,
        providerMessageId: input.providerMessageId ?? null,
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        donationId: input.donationId ?? null,
      },
    });
  } catch (err) {
    console.error("logSentMessage failed:", err);
  }
}
