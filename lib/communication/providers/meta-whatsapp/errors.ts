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
  PHONE_NOT_IN_WABA: "META_WHATSAPP_PHONE_NOT_IN_WABA",
  WABA_TEMPLATE_MANAGEMENT_NOT_ALLOWED: "META_WABA_TEMPLATE_MANAGEMENT_NOT_ALLOWED",
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
  let subcode: number | null = null;
  if (body && typeof body === "object") {
    const err = (body as { error?: { message?: unknown; code?: unknown; error_subcode?: unknown; error_user_title?: unknown; error_user_msg?: unknown; error_data?: { details?: unknown } } }).error;
    if (err) {
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "number") code = err.code;
      if (typeof err.error_subcode === "number") subcode = err.error_subcode;
      const extras = [
        typeof err.error_user_title === "string" ? err.error_user_title : "",
        typeof err.error_user_msg === "string" ? err.error_user_msg : "",
        typeof err.error_data?.details === "string" ? err.error_data.details : "",
        typeof err.error_subcode === "number" ? `subcode ${err.error_subcode}` : "",
      ].filter(Boolean).join(" · ");
      if (extras) message = [extras, message].filter(Boolean).join(" · ");
    }
  }
  const lowerMessage = message.toLowerCase();
  const templateManagementDenied = subcode === 2494160 || lowerMessage.includes("not allowed to manage templates") || lowerMessage.includes("not allowed to create or update templates");
  const reason = templateManagementDenied
    ? META_REASONS.WABA_TEMPLATE_MANAGEMENT_NOT_ALLOWED
    : status === 401 || status === 403 || code === 190
      ? META_REASONS.UNAUTHORIZED
      : META_REASONS.REQUEST_FAILED;
  const detail = scrubSecrets(`${status}${code != null ? `/${code}` : ""}: ${message}`.slice(0, 300));
  return { reason, detail };
}
