import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { encryptIntegrationSecret, decryptIntegrationSecret, integrationSecretContext, integrationEncryptionKeyIsConfigured, maskIntegrationValue } from "@/lib/integration-settings/crypto";
import { getTelegramConfig, resetTelegramConfig } from "@/lib/telegram/config";
import { buildTelegramDashboardStatus } from "@/lib/telegram/dashboard-status";
import { tgDeleteWebhook, tgGetMe, tgGetWebhookInfo, tgSetWebhook } from "@/lib/telegram/client";
import { writeAuditLog, auditActorFromDashboardSession } from "@/lib/audit-log";

const PROVIDER = "TELEGRAM_BOT";
const secretContext = (key: string) => integrationSecretContext(PROVIDER, key);
const telegramChatIdIsValid = (value: string) => /^-?\d{1,20}$/.test(value.trim());

export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  const stored = await prisma.telegramBotSetting.findUnique({ where: { singletonKey: "primary" } }).catch(() => null);
  const botToken = stored?.botTokenEncrypted
    ? safeDecrypt(stored.botTokenEncrypted, "BOT_TOKEN")
    : process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const webhookSecret = stored?.webhookSecretEncrypted
    ? safeDecrypt(stored.webhookSecretEncrypted, "WEBHOOK_SECRET")
    : process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  const environmentChatIds = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const notificationsChatId = stored?.notificationsChatId?.trim() || process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID?.trim() || "";
  const status = buildTelegramDashboardStatus({
    botToken,
    webhookSecret,
    notificationsChatId,
    storedAllowedChatIds: stored ? stored.allowedChatIds : null,
    environmentAllowedChatIds: environmentChatIds,
    storedNotificationsEnabled: stored?.notificationsEnabled ?? null,
    environmentNotificationsEnabled: process.env.TELEGRAM_NOTIFICATIONS_ENABLED,
  });
  const webhookInfo = status.configured ? await tgGetWebhookInfo() : null;
  return NextResponse.json({
    configured: status.configured,
    source: stored ? "dashboard" : "environment",
    missing: status.missing,
    botTokenConfigured: Boolean(botToken),
    botTokenMasked: botToken ? maskIntegrationValue(botToken) : null,
    webhookSecretConfigured: Boolean(webhookSecret),
    notificationsChatId: status.notificationsChatId,
    notificationsEnabled: status.notificationsEnabled,
    allowedChatIds: status.allowedChatIds,
    webhookInfo,
    canSaveSecrets: integrationEncryptionKeyIsConfigured(),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  try {
    const body = await request.json();
    const notificationsChatId = typeof body?.notificationsChatId === "string" ? body.notificationsChatId.trim() : "";
    const allowedChatIds: string[] = typeof body?.allowedChatIds === "string"
      ? body.allowedChatIds.split(/[,\n\r;]+/).map((value: string) => value.trim()).filter(Boolean)
      : [];
    if (!telegramChatIdIsValid(notificationsChatId)) {
      return NextResponse.json({ error: "A valid Telegram notification group ID is required" }, { status: 400 });
    }
    if (allowedChatIds.length > 100 || allowedChatIds.some((id: string) => !telegramChatIdIsValid(id))) {
      return NextResponse.json({ error: "Chat IDs must be valid numeric IDs; up to 100 are allowed" }, { status: 400 });
    }
    const botToken = typeof body?.botToken === "string" ? body.botToken.trim() : "";
    const webhookSecret = typeof body?.webhookSecret === "string" ? body.webhookSecret.trim() : "";
    if ((botToken || webhookSecret) && !integrationEncryptionKeyIsConfigured()) {
      return NextResponse.json({ error: "Dashboard secret storage is unavailable. Configure INTEGRATION_SETTINGS_ENCRYPTION_KEY before saving credentials." }, { status: 503 });
    }
    if (botToken && (botToken.length > 256 || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken))) {
      return NextResponse.json({ error: "The Telegram bot token format is invalid" }, { status: 400 });
    }
    if (webhookSecret && (webhookSecret.length < 16 || webhookSecret.length > 256 || !/^[A-Za-z0-9_-]+$/.test(webhookSecret))) {
      return NextResponse.json({ error: "The webhook secret must contain 16 to 256 letters, numbers, underscores, or hyphens" }, { status: 400 });
    }
    const existing = await prisma.telegramBotSetting.findUnique({ where: { singletonKey: "primary" } });
    const existingToken = existing?.botTokenEncrypted ? safeDecrypt(existing.botTokenEncrypted, "BOT_TOKEN") : null;
    const existingWebhookSecret = existing?.webhookSecretEncrypted ? safeDecrypt(existing.webhookSecretEncrypted, "WEBHOOK_SECRET") : null;
    const hasToken = Boolean(botToken || (existing?.botTokenEncrypted ? existingToken : process.env.TELEGRAM_BOT_TOKEN?.trim()));
    const hasSecret = Boolean(webhookSecret || (existing?.webhookSecretEncrypted ? existingWebhookSecret : process.env.TELEGRAM_WEBHOOK_SECRET?.trim()));
    if (!hasToken || !hasSecret) {
      return NextResponse.json({ error: "Enter both the bot token and webhook secret, or configure them in the server environment." }, { status: 400 });
    }
    const saved = await prisma.telegramBotSetting.upsert({
      where: { singletonKey: "primary" },
      create: {
        singletonKey: "primary",
        botTokenEncrypted: botToken ? encryptIntegrationSecret(botToken, secretContext("BOT_TOKEN")) : null,
        webhookSecretEncrypted: webhookSecret ? encryptIntegrationSecret(webhookSecret, secretContext("WEBHOOK_SECRET")) : null,
        notificationsChatId,
        allowedChatIds: [...new Set<string>(allowedChatIds)],
        notificationsEnabled: typeof body?.notificationsEnabled === "boolean" ? body.notificationsEnabled : true,
      },
      update: {
        botTokenEncrypted: botToken ? encryptIntegrationSecret(botToken, secretContext("BOT_TOKEN")) : existing?.botTokenEncrypted ?? null,
        webhookSecretEncrypted: webhookSecret ? encryptIntegrationSecret(webhookSecret, secretContext("WEBHOOK_SECRET")) : existing?.webhookSecretEncrypted ?? null,
        notificationsChatId,
        allowedChatIds: [...new Set<string>(allowedChatIds)],
        notificationsEnabled: typeof body?.notificationsEnabled === "boolean" ? body.notificationsEnabled : true,
      },
      select: { id: true, notificationsChatId: true, notificationsEnabled: true },
    });
    resetTelegramConfig();
    const actor = auditActorFromDashboardSession(session!);
    await writeAuditLog({
      ...actor,
      action: "TELEGRAM_SETTINGS_UPDATE",
      messageAr: (actor.actorName ?? "مسؤول") + " حدّث إعدادات بوت تيليجرام",
      entityType: "TelegramBotSetting",
      entityId: saved.id,
    });
    return NextResponse.json({
      ok: true,
      notificationsChatId: saved.notificationsChatId,
      notificationsEnabled: saved.notificationsEnabled,
      secretsSaved: Boolean(botToken || webhookSecret),
    });
  } catch (error) {
    console.error("Telegram settings save failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to save Telegram settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const cfg = await getTelegramConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "Telegram settings are incomplete" }, { status: 400 });
  }
  let body: { action?: string; url?: string } = {};
  try { body = await request.json(); } catch { /* default action is register */ }
  if (body.action === "test") {
    const result = await tgGetMe();
    if (!result.ok || !result.result) {
      return NextResponse.json({ ok: false, error: result.description ?? "Telegram connection failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, bot: { name: result.result.first_name, username: result.result.username ?? null } });
  }
  const origin = new URL(request.url).origin;
  let webhookUrl = origin + "/api/telegram/webhook";
  if (body.url?.trim()) {
    try {
      const custom = new URL(body.url.trim());
      if (custom.origin !== origin || custom.pathname !== "/api/telegram/webhook" || custom.search || custom.hash) {
        return NextResponse.json({ ok: false, error: "Webhook URL must use this site's /api/telegram/webhook endpoint" }, { status: 400 });
      }
      webhookUrl = custom.toString();
    } catch {
      return NextResponse.json({ ok: false, error: "Webhook URL is invalid" }, { status: 400 });
    }
  }
  const result = await tgSetWebhook(webhookUrl);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.description ?? "setWebhook failed" }, { status: 502 });
  // Registering the webhook only changes Telegram's endpoint; it never sends a message.
  return NextResponse.json({ ok: true, url: webhookUrl, telegram: result });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;
  const result = await tgDeleteWebhook();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

function safeDecrypt(envelope: string, key: string): string | null {
  try {
    return decryptIntegrationSecret(envelope, secretContext(key));
  } catch {
    return null;
  }
}
