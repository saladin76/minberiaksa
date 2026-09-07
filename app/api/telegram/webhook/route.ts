import { NextRequest, NextResponse } from "next/server";
import { getTelegramConfig } from "@/lib/telegram/config";
import { dispatchTelegramCommand } from "@/lib/telegram/commands";

// Bump the Node serverless time budget so cold-start + Prisma connect + a few
// DB queries + sendMessage all fit. Vercel Hobby caps to 10s regardless;
// Pro/Enterprise honors this. Telegram's webhook delivery timeout is 60s.
export const maxDuration = 60;

/**
 * Telegram webhook receiver.
 *
 * Security: we registered the webhook with `secret_token` set. Telegram echoes
 * that value back as `X-Telegram-Bot-Api-Secret-Token` on every call. We
 * compare it before doing anything — that's how we know the caller is really
 * Telegram (and not a random script that found this URL).
 *
 * Reliability: on Vercel/serverless, work scheduled with `void promise.then()`
 * after the response is sent gets terminated when the function exits — so
 * fire-and-forget would intermittently never run. We `await` the dispatcher
 * before responding. Telegram tolerates up to 60s per webhook delivery; our
 * commands complete well under that, even cold. The whole handler is wrapped
 * in a hard 45s safety timeout so we never trip Telegram's retry.
 */
const MAX_HANDLER_MS = 45_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export async function POST(req: NextRequest) {
  const cfg = getTelegramConfig();
  if (!cfg) {
    // Don't reveal that we're misconfigured — just 200 so Telegram backs off.
    return NextResponse.json({ ok: true });
  }

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== cfg.webhookSecret) {
    console.warn("[telegram webhook] bad secret header");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Record<string, unknown> | null = null;
  try {
    update = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message =
    (update?.message as Record<string, unknown> | undefined) ??
    (update?.edited_message as Record<string, unknown> | undefined) ??
    null;
  if (!message) return NextResponse.json({ ok: true });

  const chat = message.chat as { id?: number | string } | undefined;
  const from = message.from as { id?: number | string } | undefined;
  const text = typeof message.text === "string" ? message.text : "";
  const messageId = typeof message.message_id === "number" ? message.message_id : undefined;
  // Telegram annotates commands with bot_command entities. Forward them so the
  // dispatcher can recognise commands even when the text has invisible RTL/BOM
  // characters that break a naive `text.startsWith("/")` check (common on
  // Arabic mobile keyboards).
  const entities = Array.isArray(message.entities)
    ? (message.entities as Array<{ type?: string; offset?: number; length?: number }>)
    : null;

  if (!chat?.id || !text) return NextResponse.json({ ok: true });

  const started = Date.now();
  try {
    await withTimeout(
      dispatchTelegramCommand({
        chatId: chat.id,
        fromChatId: chat.id,
        text,
        entities,
        messageId,
      }),
      MAX_HANDLER_MS,
      "dispatch"
    );
    const ms = Date.now() - started;
    if (ms > 5000) {
      console.warn(`[telegram webhook] slow command (${ms}ms) text=${text.slice(0, 40)} from=${from?.id}`);
    }
  } catch (err) {
    // Caught here means the dispatcher threw or hit the 45s safety timeout.
    // We still respond 200 so Telegram doesn't retry-storm us — the command
    // is just considered lost for this delivery.
    console.error(`[telegram webhook] dispatch failed after ${Date.now() - started}ms:`, err, "text:", text.slice(0, 80), "from:", from?.id);
  }

  return NextResponse.json({ ok: true });
}

// Telegram never sends GET. Reject it with a friendly hint so curl-testers know the URL is alive.
export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "Telegram webhook endpoint. POSTs from Telegram only; verify with X-Telegram-Bot-Api-Secret-Token header.",
  });
}
