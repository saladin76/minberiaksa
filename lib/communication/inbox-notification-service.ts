import { listConversations } from "./conversation-service";

/**
 * Inbox badge count  the number of WhatsApp conversations with an inbound message not yet opened or answered. Derived from the real conversation archive via
 * conversation-service; never fabricated. Fails closed to 0 when the DB/session is unavailable.
 */
export async function getInboxBadgeCount(opts: { senderId?: string | null } = {}): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const conversations = await listConversations(opts);
    return conversations.filter((c) => c.unread).length;
  } catch (error) {
    console.error("getInboxBadgeCount failed", error);
    return 0;
  }
}
