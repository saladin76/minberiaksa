/**
 * Safe error codes for the Brevo SMS adapter (email moved to Elastic Email). Never leak the API key
 * or any secret in messages/logs — provider bodies are reduced to a safe code + short scrubbed detail.
 */

export const BREVO_SMS_REASONS = {
  NOT_CONFIGURED: "BREVO_SMS_NOT_CONFIGURED",
  REQUEST_FAILED: "BREVO_SMS_REQUEST_FAILED",
  INVALID_RESPONSE: "BREVO_SMS_INVALID_RESPONSE",
  UNAUTHORIZED: "BREVO_SMS_UNAUTHORIZED",
} as const;

/** Remove anything api-key/token-shaped before logging/storing. */
export function scrubBrevo(input: string): string {
  return input
    .replace(/xkeysib-[A-Za-z0-9-]+/gi, "***")
    .replace(/api-key[:=]\s*[^&\s"']+/gi, "api-key=***")
    .slice(0, 300);
}

export function mapBrevoError(status: number, body: unknown): { reason: string; detail: string } {
  let message = "";
  if (body && typeof body === "object") {
    const m = (body as { message?: unknown; code?: unknown }).message;
    if (typeof m === "string") message = m;
  } else if (typeof body === "string") {
    message = body;
  }
  const reason = status === 401 || status === 403 ? BREVO_SMS_REASONS.UNAUTHORIZED : BREVO_SMS_REASONS.REQUEST_FAILED;
  return { reason, detail: scrubBrevo(`${status}: ${message}`) };
}
