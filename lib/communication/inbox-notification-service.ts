import { listConversations } from "./conversation-service";

/**
 * Inbox badge count — the number of WhatsApp conversations that currently need a reply (last inbound
 * newer than last outbound and not marked handled). Derived from the real conversation archive via
 * conversation-service; never fabricated. Fails closed to 0 when the DB/session is unavailable.
 */
export async function getInboxBadgeCount(opts: { senderId?: string | null } = {}): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const conversations = await listConversations(opts);
    return conversations.filter((c) => c.needsReply).length;
  } catch (error) {
    console.error("getInboxBadgeCount failed", error);
    return 0;
  }
}
