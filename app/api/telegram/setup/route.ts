import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminSession } from "@/lib/dashboard/api-auth";
import { getTelegramConfig } from "@/lib/telegram/config";
import {
  tgDeleteWebhook,
  tgGetWebhookInfo,
  tgNotify,
  tgSetWebhook,
} from "@/lib/telegram/client";

/**
 * Admin-only Telegram bot management endpoint.
 *
 * GET  /api/telegram/setup            → return current webhook status + config snapshot
 * POST /api/telegram/setup            → register the webhook with Telegram
 *   body: { url?: string }            → defaults to `<origin>/api/telegram/webhook`
 * DELETE /api/telegram/setup          → unregister the webhook
 *
 * For convenience, POST also sends a "bot is online" message to the configured
 * notifications chat as a connectivity smoke test.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  const cfg = getTelegramConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        configured: false,
        missing: [
          process.env.TELEGRAM_BOT_TOKEN ? null : "TELEGRAM_BOT_TOKEN",
          process.env.TELEGRAM_NOTIFICATIONS_CHAT_ID ? null : "TELEGRAM_NOTIFICATIONS_CHAT_ID",
          process.env.TELEGRAM_WEBHOOK_SECRET ? null : "TELEGRAM_WEBHOOK_SECRET",
        ].filter(Boolean),
      },
      { status: 200 }
    );
  }

  const info = await tgGetWebhookInfo();
  return NextResponse.json({
    configured: true,
    notificationsChatId: cfg.notificationsChatId,
    notificationsEnabled: cfg.notificationsEnabled,
    allowedChatIds: Array.from(cfg.allowedChatIds),
    webhookInfo: info,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  const cfg = getTelegramConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: "Telegram env vars missing (TELEGRAM_BOT_TOKEN, TELEGRAM_NOTIFICATIONS_CHAT_ID, TELEGRAM_WEBHOOK_SECRET)" },
      { status: 400 }
    );
  }

  let bodyUrl: string | null = null;
  try {
    const body = (await req.json()) as { url?: string } | null;
    bodyUrl = body?.url?.trim() || null;
  } catch {
    // empty body is fine
  }

  const origin = new URL(req.url).origin;
  const webhookUrl = bodyUrl || `${origin}/api/telegram/webhook`;

  const result = await tgSetWebhook(webhookUrl);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.description ?? "setWebhook failed" },
      { status: 502 }
    );
  }

  // Connectivity smoke test — fire-and-forget, don't block the response on it.
  void tgNotify(
    "✅ <b>تم تفعيل بوت تبرعات الجمعية</b>\nأرسل <code>/help</code> لعرض الأوامر المتاحة.",
    { silent: true }
  );

  return NextResponse.json({ ok: true, url: webhookUrl, telegram: result });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const denied = requireAdminSession(session);
  if (denied) return denied;

  const result = await tgDeleteWebhook();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
