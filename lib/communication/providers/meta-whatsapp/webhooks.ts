import { createHmac, timingSafeEqual } from "node:crypto";
import { getActiveMetaWebhookConfig, type ActiveRuntimeConfig, type MetaWhatsappRuntimeValues } from "../../runtime-config";
import type { InboundMediaDescriptor, NormalizedWebhookEvent } from "./types";

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

const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Meta nests the descriptor under a key named after the type: `{ type: "image", image: {…} }`. */
function mediaDescriptor(type: string | null, message: Record<string, unknown>): InboundMediaDescriptor | null {
  if (!type || !MEDIA_TYPES.has(type)) return null;
  const node = message[type];
  if (!node || typeof node !== "object") return { kind: type, mediaId: null, mimeType: null, filename: null, caption: null };
  const row = node as Record<string, unknown>;
  return {
    kind: type,
    mediaId: str(row.id),
    mimeType: str(row.mime_type),
    filename: str(row.filename),
    caption: str(row.caption),
    ...(type === "audio" && row.voice === true ? { voice: true } : {}),
  };
}

function buttonReply(message: Record<string, unknown>): { id: string | null; title: string | null } | null {
  /* A template quick-reply arrives as `button`; a list or reply-button as `interactive`. */
  const button = message.button as Record<string, unknown> | undefined;
  if (button && typeof button === "object") return { id: str(button.payload), title: str(button.text) };
  const interactive = message.interactive as Record<string, unknown> | undefined;
  if (interactive && typeof interactive === "object") {
    const reply = (interactive.button_reply ?? interactive.list_reply) as Record<string, unknown> | undefined;
    if (reply && typeof reply === "object") return { id: str(reply.id), title: str(reply.title) };
  }
  return null;
}

function contextMessageId(message: Record<string, unknown>): string | null {
  const context = message.context as Record<string, unknown> | undefined;
  return context && typeof context === "object" ? str(context.id) : null;
}

/** Whatever the donor actually said, whichever shape it arrived in. */
function inboundText(
  type: string | null,
  message: Record<string, unknown>,
  media: InboundMediaDescriptor | null,
  button: { id: string | null; title: string | null } | null,
): string | null {
  if (type === "text") return str((message.text as { body?: unknown })?.body);
  if (media?.caption) return media.caption;
  if (button?.title) return button.title;
  if (type === "reaction") return str((message.reaction as { emoji?: unknown })?.emoji);
  if (type === "location") {
    const loc = message.location as Record<string, unknown> | undefined;
    const name = str(loc?.name) ?? str(loc?.address);
    return name ?? (loc ? `${loc.latitude}, ${loc.longitude}` : null);
  }
  if (type === "contacts") return str((Array.isArray(message.contacts) ? (message.contacts[0] as { name?: { formatted_name?: unknown } })?.name?.formatted_name : null));
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
        const media = mediaDescriptor(type, message);
        /* A media caption, a button title and a reaction emoji are all things the donor said. Each
           becomes the message's text so the inbox shows something rather than an empty bubble. */
        const button = buttonReply(message);
        const text = inboundText(type, message, media, button);
        out.push({
          kind: "inbound",
          providerMessageId: wamid,
          from: typeof message.from === "string" ? message.from : null,
          profileName,
          phoneNumberId,
          text: text ? text.slice(0, 4000) : null,
          messageType: type,
          timestamp: toNumber(message.timestamp),
          idempotencyKey: `wa:inbound:${wamid}`,
          media,
          replyToMessageId: contextMessageId(message),
          buttonReply: button,
        });
      }
    }
  }
  return out;
}
