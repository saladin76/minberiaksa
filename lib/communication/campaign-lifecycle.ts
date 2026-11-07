export const UNSENT_CAMPAIGN_STATUSES = ["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "CANCELLED", "FAILED", "BLOCKED"] as const;

/** UI hint and service precondition. The service additionally verifies delivery history under a transaction. */
export function canDeleteUnsentCampaign(row: { status: string; sentCount: number; deliveredCount: number; readCount: number; failedCount: number; repliedCount: number; clickedCount: number }) {
  return (UNSENT_CAMPAIGN_STATUSES as readonly string[]).includes(row.status) &&
    [row.sentCount, row.deliveredCount, row.readCount, row.failedCount, row.repliedCount, row.clickedCount].every(value => value === 0);
}
