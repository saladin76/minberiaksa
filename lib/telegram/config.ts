import { prisma } from "@/lib/prisma";
import {
  decryptIntegrationSecret,
  integrationSecretContext,
} from "@/lib/integration-settings/crypto";

/**
 * Telegram credentials may come from the dashboard's encrypted settings or the
 * original environment variables. A saved value takes precedence; unset fields
 * continue to use the environment so existing deployments remain compatible.
 */
export interface TelegramConfig {
  botToken: string;
  notificationsChatId: string;
  webhookSecret: string;
  allowedChatIds: Set<string>;
  notificationsEnabled: boolean;
}

let cached: { value: TelegramConfig | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;
const SECRET_PROVIDER = "TELEGRAM_BOT";

function decrypt(value: string | null | undefined, key: string): string | null {
  if (!value) return null;
  try {
    return decryptIntegrationSecret(value, integrationSecretContext(SECRET_PROVIDER, key));
  } catch (error) {
    console.error("[telegram] encrypted settings could not be read", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let stored: Awaited<ReturnType<typeof prisma.telegramBotSetting.findUnique>> = null;
  try {
    stored = await prisma.telegramBotSetting.findUnique({ where: { singletonKey: "primary" } });
  } catch {
    // Database reads can fail during startup; retain support for environment-only deployments.
  }

  const storedBotToken = stored?.botTokenEncrypted ? decrypt(stored.botTokenEncrypted, "BOT_TOKEN") : null;
  const storedWebhookSecret = stored?.webhookSecretEncrypted ? decrypt(stored.webhookSecretEncrypted, "WEBHOOK_SECRET") : null;
  const botToken = stored?.botTokenEncrypted ? storedBotToken ?? "" : process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const webhookSecret = stored?.webhookSecretEncrypted ? storedWebhookSecret ?? "" : process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const notificationsChatId = stored?.notificationsChatId?.trim() || process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID?.trim() || "";
  if (!botToken || !webhookSecret || !notificationsChatId) {
    cached = { value: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
  const environmentAllowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const configuredAllowed = stored ? stored.allowedChatIds : environmentAllowed;
  const allowedChatIds = new Set<string>([notificationsChatId, ...configuredAllowed].filter(Boolean));
  const notificationsEnabled = stored
    ? stored.notificationsEnabled
    : (process.env.TELEGRAM_NOTIFICATIONS_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const config = { botToken, notificationsChatId, webhookSecret, allowedChatIds, notificationsEnabled };
  cached = { value: config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

/** A group upgraded to a supergroup gets a new id. Adopt it for this process
 * and persist it when the dashboard owns the current setting. */
export async function adoptMigratedChat(oldId: string, newId: string): Promise<void> {
  const cfg = await getTelegramConfig();
  if (!cfg) return;
  if (cfg.notificationsChatId === oldId) cfg.notificationsChatId = newId;
  if (cfg.allowedChatIds.has(oldId)) cfg.allowedChatIds.add(newId);
  try {
    await prisma.telegramBotSetting.updateMany({
      where: { singletonKey: "primary", notificationsChatId: oldId },
      data: { notificationsChatId: newId, allowedChatIds: [...cfg.allowedChatIds] },
    });
  } catch {
    // The active config already works for this process; dashboard persistence can be retried.
  }
  cached = { value: cfg, expiresAt: Date.now() + CACHE_TTL_MS };
  console.warn("[telegram] a Telegram group was upgraded to a supergroup; the new chat id was adopted");
}

/** Reset the short runtime cache (used after dashboard settings are saved and in tests). */
export function resetTelegramConfig(): void {
  cached = null;
}
