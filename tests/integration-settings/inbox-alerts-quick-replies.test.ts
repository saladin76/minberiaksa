import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
const layout = read("app/(dashboard)/dashboard/DashboardLayoutClient.tsx");
const page = read("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx");
const alerts = read("lib/communication/inbox-alerts.ts");
const api = read("app/api/dashboard/communication/inbox/quick-replies/route.ts");

test("alerts: only when the unread total grows, never on the first read; title shows the count", () => {
  assert.match(alerts, /if \(previous === null \|\| next <= previous \|\| !inboxAlertsEnabled\(\)\) return;/);
  assert.match(alerts, /document\.hidden\)/, "browser notification only for a background tab");
  assert.match(layout, /alertOnNewInboxMessages\(last, next,/);
  assert.match(layout, /document\.hidden && !inboxAlertsEnabled\(\)/, "keeps checking from a background tab when alerts are on");
  assert.match(layout, /setInboxTitleCount\(whatsappInboxCount\)/);
});

test("the conversations page offers the on/off switch and the browser-permission request", () => {
  assert.match(page, /setInboxAlertsEnabled\(v\)/);
  assert.match(page, /requestNotificationPermission\(\)/);
});

test("quick replies: messages permission, validated, per language, insert into the draft", () => {
  assert.equal((api.match(/requireAdminOrDashboardPermission\(session, "messages"\)/g) ?? []).length, 1);
  assert.equal((api.match(/const \{ (session, )?denied \} = await gate\(\);\n  if \(denied\) return denied;/g) ?? []).length, 3, "GET, POST and DELETE are gated");
  assert.match(api, /title\.length > 60 \|\| body\.length > 1000/);
  assert.match(api, /language: \{ \$in: \[lang, "all"\] \}/);
  assert.match(page, /onClick=\{\(\) => \{ setDraft\(r\.body\); setShowQuick\(false\); \}\}/);
});
