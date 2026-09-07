import { getTelegramConfig } from "./config";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function call<T>(method: string, payload: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  const cfg = getTelegramConfig();
  if (!cfg) {
    return { ok: false, description: "Telegram not configured (missing TELEGRAM_BOT_TOKEN / chat id / secret)" };
  }
  const url = `https://api.telegram.org/bot${cfg.botToken}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Bot API is rarely slow; cap so a dead network doesn't hang request handlers.
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as TelegramApiResponse<T>;
    if (!data.ok) {
      console.warn(`[telegram] ${method} failed:`, data.description, data.error_code);
    }
    return data;
  } catch (err) {
    console.error(`[telegram] ${method} threw:`, err);
    return { ok: false, description: (err as Error).message };
  }
}

export interface SendMessageOptions {
  /** HTML mode is the default; pass false to send plain text. */
  html?: boolean;
  /** Don't generate a notification on the recipient's device. */
  silent?: boolean;
  /** Reply to a specific message (used in command responses). */
  replyToMessageId?: number;
  /** Disable URL preview rendering. */
  disablePreview?: boolean;
}

/** Send a message. Returns true if Telegram accepted it. */
export async function tgSendMessage(
  chatId: string | number,
  text: string,
  opts: SendMessageOptions = {}
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_notification: opts.silent === true,
  };
  if (opts.html !== false) payload.parse_mode = "HTML";
  if (opts.replyToMessageId) payload.reply_parameters = { message_id: opts.replyToMessageId };
  if (opts.disablePreview) payload.link_preview_options = { is_disabled: true };
  const res = await call("sendMessage", payload);
  return res.ok;
}

/** Send a message to the configured notifications chat. */
export async function tgNotify(text: string, opts: SendMessageOptions = {}): Promise<boolean> {
  const cfg = getTelegramConfig();
  if (!cfg || !cfg.notificationsEnabled) return false;
  return tgSendMessage(cfg.notificationsChatId, text, opts);
}

/** Register the webhook with Telegram. Returns the API response. */
export async function tgSetWebhook(url: string): Promise<TelegramApiResponse<unknown>> {
  const cfg = getTelegramConfig();
  if (!cfg) return { ok: false, description: "Telegram not configured" };
  return call("setWebhook", {
    url,
    secret_token: cfg.webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}

export async function tgGetWebhookInfo(): Promise<TelegramApiResponse<unknown>> {
  return call("getWebhookInfo", {});
}

export async function tgDeleteWebhook(): Promise<TelegramApiResponse<unknown>> {
  return call("deleteWebhook", { drop_pending_updates: false });
}

/** Escape a string for Telegram HTML (`parse_mode=HTML`). */
export function htmlEscape(input: string | number | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
