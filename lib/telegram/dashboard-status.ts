export type TelegramDashboardStatusInput = {
  botToken?: string | null;
  webhookSecret?: string | null;
  notificationsChatId?: string | null;
  storedAllowedChatIds?: string[] | null;
  environmentAllowedChatIds?: string[] | null;
  storedNotificationsEnabled?: boolean | null;
  environmentNotificationsEnabled?: string | null;
};

/** Resolve each dashboard field independently so one missing credential does not
 *  make the status screen incorrectly report every other field as missing. */
export function buildTelegramDashboardStatus(input: TelegramDashboardStatusInput) {
  const botToken = input.botToken?.trim() ?? "";
  const webhookSecret = input.webhookSecret?.trim() ?? "";
  const notificationsChatId = input.notificationsChatId?.trim() ?? "";
  const missing = [
    botToken ? null : "TELEGRAM_BOT_TOKEN",
    notificationsChatId ? null : "TELEGRAM_NOTIFICATIONS_CHAT_ID",
    webhookSecret ? null : "TELEGRAM_WEBHOOK_SECRET",
  ].filter((value): value is string => value !== null);
  const allowed = input.storedAllowedChatIds ?? input.environmentAllowedChatIds ?? [];
  const allowedChatIds = [...new Set([...allowed.map((id) => id.trim()).filter(Boolean), notificationsChatId])]
    .filter(Boolean);

  return {
    configured: missing.length === 0,
    missing,
    notificationsChatId,
    allowedChatIds,
    notificationsEnabled: input.storedNotificationsEnabled ??
      (input.environmentNotificationsEnabled ?? "true").trim().toLowerCase() !== "false",
  };
}
