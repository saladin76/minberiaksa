/** Cumulative stages inferred from observed email events; timestamps remain unchanged. */
export function emailDeliveryProgress(row: {
  status: string;
  providerMessageId?: string | null;
  sentAt?: unknown;
  deliveredAt?: unknown;
  openedAt?: unknown;
  clickedAt?: unknown;
}) {
  const clicked = Boolean(row.clickedAt) || row.status === "CLICKED";
  const opened = Boolean(row.openedAt) || row.status === "OPENED" || clicked;
  const delivered = Boolean(row.deliveredAt) || row.status === "DELIVERED" || opened;
  const accepted = Boolean(row.providerMessageId) || Boolean(row.sentAt) ||
    ["SENT", "SENT_TO_PROVIDER", "BOUNCED"].includes(row.status) || delivered;
  const failed = ["FAILED", "BOUNCED"].includes(row.status);
  return { accepted, delivered, opened, clicked, failed, attempted: accepted || failed };
}
