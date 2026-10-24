/** Whether the archive contains enough of the original message to retry it faithfully. */
export type RetryArchiveSnapshot = {
  channel: string;
  templateId?: string | null;
  renderedBody?: string | null;
  variables?: unknown;
};

export function retryPayloadBlockReason(row: RetryArchiveSnapshot): "NO_RENDERED_BODY" | null {
  if (row.channel === "WHATSAPP") {
    return row.templateId && row.variables && typeof row.variables === "object" ? null : "NO_RENDERED_BODY";
  }
  return typeof row.renderedBody === "string" && row.renderedBody.trim().length > 0 ? null : "NO_RENDERED_BODY";
}
