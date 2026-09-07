import { createHmac, timingSafeEqual } from "node:crypto";
import { getActiveMetaWebhookConfig, type ActiveRuntimeConfig, type MetaWhatsappRuntimeValues } from "../../runtime-config";
import type { NormalizedWebhookEvent } from "./types";

export type MetaWebhookRuntimeConfig = ActiveRuntimeConfig<Pick<MetaWhatsappRuntimeValues, "appSecret" | "verifyToken">>;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyWebhookChallenge(mode: string | null, token: string | null, challenge: string | null, runtime?: MetaWebhookRuntimeConfig): Promise<string | null> {
  const config = runtime ?? await getActiveMetaWebhookConfig();
  if (!config.configured || mode !== "subscribe" || !token || !challenge) return null;
  return safeEqual(token, config.values.verifyToken) ? challenge : null;
}

export async function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, runtime?: MetaWebhookRuntimeConfig): Promise<"valid" | "invalid" | "unconfigured" | "error"> {
  const config = runtime ?? await getActiveMetaWebhookConfig();
  if (!config.configured) return config.reason === "INTEGRATION_DECRYPTION_FAILED" ? "error" : "unconfigured";
  if (!signatureHeader?.startsWith("sha256=")) return "invalid";
  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", config.values.appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function mapStatus(status: string): "SENT" | "DELIVERED" | "READ" | "FAILED" | null {
  if (status === "sent") return "SENT";
  if (status === "delivered") return "DELIVERED";
  if (status === "read") return "READ";
  if (status === "failed") return "FAILED";
  return null;
}

function firstErrorMessage(errors: unknown): string | null {
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
    const e = errors[0] as { title?: unknown; message?: unknown };
    const text = (typeof e.message === "string" && e.message) || (typeof e.title === "string" && e.title) || "";
    return text ? text.slice(0, 300) : null;
  }
  return null;
}

export function parseWebhookPayload(payload: unknown): NormalizedWebhookEvent[] {
  const out: NormalizedWebhookEvent[] = [];
  const root = payload as { object?: unknown; entry?: unknown[] } | null;
  if (!root || root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return out;
  for (const entry of root.entry) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value || typeof value !== "object") continue;
      const metadata = value.metadata as { phone_number_id?: unknown } | undefined;
      const phoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : null;
      const contacts = Array.isArray(value.contacts) ? value.contacts as Record<string, unknown>[] : [];
      const profile = contacts[0]?.profile as { name?: unknown } | undefined;
      const profileName = typeof profile?.name === "string" ? profile.name : null;
      const statuses = Array.isArray(value.statuses) ? value.statuses as Record<string, unknown>[] : [];
      for (const status of statuses) {
        const wamid = typeof status.id === "string" ? status.id : null;
        const mapped = typeof status.status === "string" ? mapStatus(status.status) : null;
        if (!wamid || !mapped) continue;
        out.push({
          kind: "status",
          providerMessageId: wamid,
          status: mapped,
          recipient: typeof status.recipient_id === "string" ? status.recipient_id : null,
          phoneNumberId,
          timestamp: toNumber(status.timestamp),
          errorMessage: mapped === "FAILED" ? firstErrorMessage(status.errors) : null,
          idempotencyKey: `wa:status:${wamid}:${mapped}`,
        });
      }
      const messages = Array.isArray(value.messages) ? value.messages as Record<string, unknown>[] : [];
      for (const message of messages) {
        const wamid = typeof message.id === "string" ? message.id : null;
        if (!wamid) continue;
        const type = typeof message.type === "string" ? message.type : null;
        const text = type === "text" ? (message.text as { body?: unknown })?.body : undefined;
        out.push({
          kind: "inbound",
          providerMessageId: wamid,
          from: typeof message.from === "string" ? message.from : null,
          profileName,
          phoneNumberId,
          text: typeof text === "string" ? text.slice(0, 4000) : null,
          messageType: type,
          timestamp: toNumber(message.timestamp),
          idempotencyKey: `wa:inbound:${wamid}`,
        });
      }
    }
  }
  return out;
}
