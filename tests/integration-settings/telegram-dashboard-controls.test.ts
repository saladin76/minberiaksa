import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("Telegram credentials are admin-managed, encrypted, and masked", () => {
  const route = read("app/api/telegram/setup/route.ts");
  assert.match(route, /export async function PUT/);
  assert.match(route, /requireAdminSession/);
  assert.match(route, /encryptIntegrationSecret/);
  assert.match(route, /maskIntegrationValue/);
  assert.match(route, /botTokenMasked/);
  assert.doesNotMatch(route, /tgNotify\(/);
});

test("Telegram connection testing reads bot identity and webhook registration does not drop queued updates", () => {
  const route = read("app/api/telegram/setup/route.ts");
  const client = read("lib/telegram/client.ts");
  assert.match(route, /action === "test"/);
  assert.match(route, /tgGetMe\(\)/);
  assert.match(client, /drop_pending_updates: false/);
  assert.match(client, /await getTelegramConfig\(\)/);
});

test("Telegram dashboard explains outbound donation fields and command privacy", () => {
  const page = read("app/(dashboard)/dashboard/telegram/page.tsx");
  assert.match(page, /معرّف مجموعة الإشعارات/);
  assert.match(page, /ما الذي يصل إلى رسائل البوت/);
  assert.match(page, /البريد الإلكتروني لا يظهر في بطاقة الإشعار/);
  assert.match(page, /معرّفات الدردشات المسموح بها/);
});
