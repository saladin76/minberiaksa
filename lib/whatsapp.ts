/**
 * LEGACY ONLY — disabled by default. Active WhatsApp sending uses Meta WhatsApp Cloud API through
 * Communication Center ProviderRouter (lib/communication/provider-router.ts → providers/meta-whatsapp).
 *
 * This Twilio-backed path is retained ONLY for emergency/manual migration and is HARD-DISABLED unless
 * `WHATSAPP_LEGACY_TWILIO_ENABLED === "true"`. When disabled it initializes no Twilio client, sends
 * nothing, and returns a failed result (`TWILIO_LEGACY_DISABLED`) for every recipient so callers
 * archive SKIPPED/FAILED — never a fake success. No active Communication Center route relies on this.
 */

const LEGACY_TWILIO_ENABLED = () => process.env.WHATSAPP_LEGACY_TWILIO_ENABLED === "true";

// Lazily-imported Twilio client (only ever loaded when the legacy flag is explicitly on).
let cachedClient: unknown = null;

async function getClient() {
  if (!LEGACY_TWILIO_ENABLED()) return null;
  if (cachedClient) return cachedClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  // Dynamic import so `twilio` is never initialized in the default (disabled) path.
  const { default: twilio } = await import("twilio");
  cachedClient = twilio(sid, token);
  return cachedClient;
}

function getFrom(): string | null {
  return process.env.TWILIO_WHATSAPP_FROM ?? null;
}

/** Ensure the recipient address is in `whatsapp:+E164` form. */
function normalizeTo(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  if (trimmed.startsWith("+")) return `whatsapp:${trimmed}`;
  if (/^\d+$/.test(trimmed)) return `whatsapp:+${trimmed}`;
  return null;
}

export interface WhatsappRecipient {
  to: string;
  body: string;
}

export interface WhatsappResult {
  sent: number;
  failed: { to: string; error: string }[];
}

/**
 * LEGACY Twilio bulk WhatsApp. Disabled by default — returns `TWILIO_LEGACY_DISABLED` for every
 * recipient unless `WHATSAPP_LEGACY_TWILIO_ENABLED=true`. Even with the flag on this is emergency-only
 * and is not wired into any active Communication Center send path.
 */
export async function sendBulkWhatsapp(
  recipients: WhatsappRecipient[]
): Promise<WhatsappResult> {
  const out: WhatsappResult = { sent: 0, failed: [] };
  if (recipients.length === 0) return out;

  // HARD GUARD: Twilio WhatsApp is legacy-disabled. Never sends unless the explicit flag is set.
  if (!LEGACY_TWILIO_ENABLED()) {
    out.failed = recipients.map((r) => ({ to: r.to, error: "TWILIO_LEGACY_DISABLED" }));
    return out;
  }

  type TwilioLike = { messages: { create: (a: { from: string; to: string; body: string }) => Promise<unknown> } };
  const client = (await getClient()) as TwilioLike | null;
  const from = getFrom();
  if (!client || !from) {
    // Flag on but credentials missing — do NOT count as sent. Honest failure reason.
    out.failed = recipients.map((r) => ({ to: r.to, error: "WHATSAPP_PROVIDER_NOT_CONFIGURED" }));
    return out;
  }

  const CONCURRENCY = 5;
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= recipients.length) return;
      const r = recipients[i];
      const to = normalizeTo(r.to);
      if (!to) {
        out.failed.push({ to: r.to, error: "Invalid phone number" });
        continue;
      }
      try {
        await client!.messages.create({ from: from!, to, body: r.body });
        out.sent += 1;
      } catch (err) {
        out.failed.push({
          to: r.to,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, recipients.length) }, worker));
  return out;
}
