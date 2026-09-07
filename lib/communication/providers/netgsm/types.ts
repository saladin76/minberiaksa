export type NetgsmSmsInput = { to: string; content: string };

export type NetgsmSendResult =
  | { ok: true; providerMessageId: string | null; internalAccepted: boolean }
  | { ok: false; reason: string; detail?: string };

/**
 * Turkish number detection for Netgsm routing:
 *  - explicit countryCode "TR"
 *  - E.164 / dialled prefixes: +90, 0090, 90XXXXXXXXXX (12 digits starting 90)
 */
export function isTurkishNumber(phone: string | null | undefined, countryCode?: string | null): boolean {
  if ((countryCode ?? "").trim().toUpperCase() === "TR") return true;
  const raw = (phone ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("+90") || raw.startsWith("0090")) return true;
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("90") && digits.length === 12;
}
