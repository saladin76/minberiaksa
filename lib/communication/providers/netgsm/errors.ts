/** Safe error codes for the Netgsm SMS adapter. Never leak usercode/password in messages/logs. */

export const NETGSM_REASONS = {
  NOT_CONFIGURED: "NETGSM_NOT_CONFIGURED",
  NOT_TURKISH: "NETGSM_RECIPIENT_NOT_TURKISH",
  REQUEST_FAILED: "NETGSM_REQUEST_FAILED",
  INVALID_RESPONSE: "NETGSM_INVALID_RESPONSE",
  REJECTED: "NETGSM_REJECTED",
  UNAUTHORIZED: "NETGSM_UNAUTHORIZED",
  HEADER_NOT_APPROVED: "NETGSM_HEADER_NOT_APPROVED",
  MESSAGE_INVALID: "NETGSM_MESSAGE_INVALID",
  QUOTA_EXCEEDED: "NETGSM_QUOTA_EXCEEDED",
} as const;

export function scrubNetgsm(input: string): string {
  return input
    .replace(/(usercode|password)["'=:\s]+[^&\s"']+/gi, "$1=***")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic ***")
    .slice(0, 300);
}

/**
 * Netgsm success is code "00" (and returns a jobid). Other codes are errors.
 *
 * Every non-success code used to collapse into NETGSM_REJECTED, which is what the campaign wrote
 * onto the delivery row — so a wrong password and a message over the character limit produced the
 * same, unactionable line in the send log. The codes below are the ones an operator can actually
 * do something about, so they get their own reason. See docs/integrations/netgsm-sms.md.
 *
 *   30 — usercode/password rejected, OR the account has no API access permission
 *   40 — msgheader is not one of the approved sender headers on this account
 *   20 — message text problem (over the character limit, or unsupported characters)
 *   50/51 — İYS (Turkish commercial-message registry) rejection
 *   70 — malformed request parameters
 *   80/85 — sending-rate or duplicate-send limit hit
 */
export function mapNetgsmCode(code: string): { ok: boolean; reason: string } {
  if (code === "00") return { ok: true, reason: "" };
  if (code === "30") return { ok: false, reason: NETGSM_REASONS.UNAUTHORIZED };
  if (code === "40") return { ok: false, reason: NETGSM_REASONS.HEADER_NOT_APPROVED };
  if (code === "20" || code === "70") return { ok: false, reason: NETGSM_REASONS.MESSAGE_INVALID };
  if (code === "80" || code === "85") return { ok: false, reason: NETGSM_REASONS.QUOTA_EXCEEDED };
  return { ok: false, reason: NETGSM_REASONS.REJECTED };
}

/**
 * Netgsm answers a rejected send with a NON-2xx status whose body still carries the real code —
 * e.g. `HTTP 406 {"code":"30","description":"Check the usercode-password information and API
 * access permission"}`. Reading only `res.ok` therefore turned every credential and header problem
 * into NETGSM_REQUEST_FAILED, which reads like a network outage and sent operators looking in the
 * wrong place. Returns null when the body carries no code, so genuine transport failures still
 * surface as NETGSM_REQUEST_FAILED.
 */
export function readNetgsmCode(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    // `JSON.parse("30")` succeeds and yields the NUMBER 30, so a bare plain-text code parses as
    // valid JSON and must still fall through to the text form below rather than reading `.code`.
    if (parsed && typeof parsed === "object") {
      const code = (parsed as { code?: unknown }).code;
      if (typeof code === "string" && code.trim()) return code.trim();
      if (typeof code === "number") return String(code);
      return null;
    }
  } catch {
    // Not JSON at all — fall through to the plain-text form.
  }
  const match = text.trim().match(/^(\d{2})\b/);
  return match ? match[1] : null;
}
