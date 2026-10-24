import test from "node:test";
import assert from "node:assert/strict";
import { buildTelegramDashboardStatus } from "../../lib/telegram/dashboard-status";

test("Telegram dashboard status keeps known values visible when a different secret is missing", () => {
  const status = buildTelegramDashboardStatus({
    botToken: "123:token",
    webhookSecret: null,
    notificationsChatId: "-100123456789",
    storedAllowedChatIds: ["123456"],
  });

  assert.equal(status.configured, false);
  assert.deepEqual(status.missing, ["TELEGRAM_WEBHOOK_SECRET"]);
  assert.equal(status.notificationsChatId, "-100123456789");
  assert.deepEqual(status.allowedChatIds, ["123456", "-100123456789"]);
});

test("Telegram dashboard status falls back to environment chat settings when stored values are blank", () => {
  const status = buildTelegramDashboardStatus({
    botToken: "123:token",
    webhookSecret: "secret",
    notificationsChatId: "  -100987654321  ",
    storedAllowedChatIds: null,
    environmentAllowedChatIds: ["123", " 456 "],
    environmentNotificationsEnabled: "false",
  });

  assert.equal(status.configured, true);
  assert.equal(status.notificationsChatId, "-100987654321");
  assert.deepEqual(status.allowedChatIds, ["123", "456", "-100987654321"]);
  assert.equal(status.notificationsEnabled, false);
});
