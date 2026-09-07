/**
 * Safe error mapping for the Meta WhatsApp adapter. Never leak the access token or app secret
 * in messages or logs. Provider error bodies are reduced to a safe code + short detail.
 */

export const META_REASONS = {
  NOT_CONFIGURED: "META_WHATSAPP_NOT_CONFIGURED",
  SENDER_MISSING_PHONE_NUMBER_ID: "META_WHATSAPP_SENDER_MISSING_PHONE_NUMBER_ID",
  REQUEST_FAILED: "META_WHATSAPP_REQUEST_FAILED",
  INVALID_RESPONSE: "META_WHATSAPP_INVALID_RESPONSE",
  UNAUTHORIZED: "META_WHATSAPP_UNAUTHORIZED",
} as const;

/** Remove anything token-shaped from a string before it is logged/stored. */
export function scrubSecrets(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(/EA[A-Za-z0-9]{20,}/g, "***")
    .replace(/access_token=[^&\s"]+/gi, "access_token=***");
}

/** Map a Meta Graph error body into a safe internal reason + short, scrubbed detail. */
export function mapGraphError(status: number, body: unknown): { reason: string; detail: string } {
  let message = "";
  let code: number | null = null;
  if (body && typeof body === "object") {
    const err = (body as { error?: { message?: unknown; code?: unknown } }).error;
    if (err) {
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "number") code = err.code;
    }
  }
  const reason = status === 401 || status === 403 || code === 190 ? META_REASONS.UNAUTHORIZED : META_REASONS.REQUEST_FAILED;
  const detail = scrubSecrets(`${status}${code != null ? `/${code}` : ""}: ${message}`.slice(0, 300));
  return { reason, detail };
}
