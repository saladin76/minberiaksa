# Telegram Bot — Setup

Outbound donation notifications + inbound stats/lookup commands.

## 1. Create the bot

1. Open Telegram, message **@BotFather** → `/newbot`.
2. Pick a name and a username (must end in `bot`).
3. Copy the **bot token** BotFather returns. This is `TELEGRAM_BOT_TOKEN`.
4. (Optional but nice) set a description, about text, and profile picture via `/setdescription`, `/setabouttext`, `/setuserpic`.

## 2. Create the notifications chat

Create a private Telegram group, add the bot as a member, and (in groups) **promote it to admin** so it can post. Then get the chat ID:

- Easiest: add **@RawDataBot** to the group temporarily, look at `chat.id` in its dump, then remove it. The id will look like `-1001234567890` for supergroups.
- This goes into `TELEGRAM_NOTIFICATIONS_CHAT_ID`.

## 3. Pick a webhook secret

Any opaque random string, e.g. `openssl rand -hex 32`. Goes into `TELEGRAM_WEBHOOK_SECRET`. Telegram will include this in a header on every webhook call so we can verify the caller is really Telegram.

## 4. Env vars

Add to `.env.production` (and `.env.local` if you want notifications in dev):

```bash
TELEGRAM_BOT_TOKEN=123456:AAH...
TELEGRAM_NOTIFICATIONS_CHAT_ID=-1001234567890
TELEGRAM_WEBHOOK_SECRET=replace-with-random-string

# Optional — extra chat ids allowed to issue commands (the notifications chat is always allowed)
# TELEGRAM_ALLOWED_CHAT_IDS=12345,67890

# Optional — set to "false" to silence outbound notifications (commands still work)
# TELEGRAM_NOTIFICATIONS_ENABLED=true
```

## 5. Register the webhook

After deploying, hit the admin-only setup endpoint **as a logged-in ADMIN**:

```bash
curl -X POST https://your-domain.com/api/telegram/setup \
  -H "Cookie: <your admin session cookies>"
``````

The endpoint auto-derives the webhook URL from the request origin (`<origin>/api/telegram/webhook`). To override, send `{ "url": "https://..." }` in the body.

On success you'll see a "✅ تم تفعيل بوت تبرعات الجمعية" message in the notifications chat as a smoke test.

Other admin endpoints:

- `GET /api/telegram/setup` — show webhook info and current config
- `DELETE /api/telegram/setup` — unregister the webhook

## 6. Commands

Send these in the notifications chat (or any chat in `TELEGRAM_ALLOWED_CHAT_IDS`):

| Command | What it does |
| --- | --- |
| `/start`, `/help` | List all commands |
| `/today` | Today's donations summary (paid, failed, pending, top campaigns) |
| `/week` | Last 7 days |
| `/month` | Last 30 days |
| `/total` | All-time totals |
| `/recent` | Last 8 successful donations |
| `/failed` | Last 8 failed donations |
| `/pending` | Donations stuck at PAID without `paidAt` (gateway hasn't confirmed) |
| `/donation <id>` | Full details for one donation |
| `/donor <email or name>` | Look up a donor + their lifetime stats |
| `/campaign <name or id>` | Look up campaign totals |

Time stamps are in **Europe/Istanbul (TR)** to match the dashboard.

## 7. Outbound notifications

Notifications fire from the existing `dispatchEvent` system in `lib/events/dispatch.ts`, which is already invoked by every payment webhook:

- **Stripe** (`app/api/stripe/webhook/route.ts`) — paid + subscription invoices
- **PayFor / Ziraat** (`app/api/payfor/3dpay/ok/route.ts`, `…/fail/route.ts`)
- **Manual fail** (`app/api/donations/[id]/fail/route.ts`)
- **Stripe Elements confirm** (`app/api/donations/[id]/route.ts`)

So every donation that becomes PAID or FAILED produces a Telegram card automatically.

A separate "🌟 أول تبرع لهذا المتبرع" banner is sent the first time a donor's PAID count hits 1.

## 8. Failure modes

- Bot misconfigured or unreachable → notifications silently drop; payment flow is unaffected (everything is `void` / fire-and-forget).
- Webhook called without the secret header → returns 401, request never reaches the dispatcher.
- Command from a non-allowlisted chat → logged + ignored.
- LLM/NL is intentionally disabled — only the slash commands above respond.
