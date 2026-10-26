/** Keep previously loaded history while refreshing message delivery states. */
export function mergeInboxTimeline<T extends { id: string; at: string | null }>(previous: T[], incoming: T[]): T[] {
  const items = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "") || a.id.localeCompare(b.id));
}

/** Only a provider-accepted outbound attempt can satisfy a pending reply. */
export const INBOX_ACCEPTED_STATUSES = ["SENT", "DELIVERED", "READ"];
