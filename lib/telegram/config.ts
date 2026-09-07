/**
 * Telegram bot configuration — read once from env, validated on first use.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN              required — from @BotFather
 *   TELEGRAM_NOTIFICATIONS_CHAT_ID  required — group/channel id where donations are announced
 *   TELEGRAM_WEBHOOK_SECRET         required — opaque string; Telegram echoes it via
 *                                              X-Telegram-Bot-Api-Secret-Token so we can verify the caller
 *   TELEGRAM_ALLOWED_CHAT_IDS       optional — comma-separated extra chat ids allowed to issue commands
 *                                              (the notifications chat is always allowed)
 *   TELEGRAM_NOTIFICATIONS_ENABLED  optional — set to "false" to silence outbound notifications
 */
export interface TelegramConfig {
  botToken: string;
  notificationsChatId: string;
  webhookSecret: string;
  allowedChatIds: Set<string>;
  notificationsEnabled: boolean;
}

let cached: TelegramConfig | null = null;

export function getTelegramConfig(): TelegramConfig | null {
  if (cached) return cached;

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const notificationsChatId = process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!botToken || !notificationsChatId || !webhookSecret) {
    return null;
  }

  const extra = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedChatIds = new Set<string>([notificationsChatId, ...extra]);

  const notificationsEnabled =
    (process.env.TELEGRAM_NOTIFICATIONS_ENABLED ?? "true").trim().toLowerCase() !== "false";

  cached = {
    botToken,
    notificationsChatId,
    webhookSecret,
    allowedChatIds,
    notificationsEnabled,
  };
  return cached;
}

/** Reset the cached config (useful in tests / hot-reload). */
export function resetTelegramConfig(): void {
  cached = null;
}
