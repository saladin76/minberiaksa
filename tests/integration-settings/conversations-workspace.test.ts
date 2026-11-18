import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx", "utf8");
const page = fs.readFileSync("app/(dashboard)/dashboard/communication/conversations/page.tsx", "utf8");
const staff = fs.readFileSync("app/api/dashboard/communication/inbox/conversations/staff/route.ts", "utf8");

test("the page uses the inbox permission and the phase-1 conversation API", () => {
  assert.match(page, /resolveDashboardPageAccess\(session, "messages"\)/);
  assert.match(ui, /fetch\(`\$\{API\}\/conversations\?\$\{p\}`/);
  assert.match(ui, /method: "PATCH"[\s\S]*?read: true/);
});

test("replies go through the existing, tested sender (24-hour window and do-not-contact enforced server-side)", () => {
  assert.match(ui, /JSON\.stringify\(\{ action: "reply", body: draft\.trim\(\) \}\)/);
  assert.match(ui, /\$\{API\}\/\$\{encodeURIComponent\(activeId\)\}\/media/);
  assert.match(ui, /REPLY_WINDOW_CLOSED/);
});

test("four language tabs, the views, assignment and done", () => {
  for (const k of ['key: "ar"', 'key: "tr"', 'key: "fr"', 'key: "en"']) assert.ok(ui.includes(k), k);
  for (const v of ['"all"', '"mine"', '"unread"', '"done"']) assert.ok(ui.includes(v), v);
  assert.match(ui, /patch\(\{ assignToMe: true \}\)/);
  assert.match(ui, /status: active\.status === "DONE" \? "OPEN" : "DONE"/);
});

test("colleagues are exactly the people who can open the inbox", () => {
  assert.match(staff, /requireAdminOrDashboardPermission\(session, "messages"\)/);
  assert.match(staff, /userHasDashboardPermission\([^)]*"messages"\)/);
  assert.doesNotMatch(staff, /email: u\.email,|password/i, "only id and display name leave the server");
});

test("every label is translated in English and Turkish", () => {
  const keys = new Set([...ui.matchAll(/dt\("([^"]+)"/g), ...page.matchAll(/dt\("([^"]+)"/g)].map((m) => m[1]));
  for (const k of ["العربية", "التركية", "الفرنسية", "الإنجليزية"]) keys.add(k);
  for (const lang of ["en", "tr"]) {
    const cat = JSON.parse(fs.readFileSync(`lib/dashboard/i18n/catalog/${lang}.json`, "utf8")) as Record<string, string>;
    for (const k of keys) assert.ok(cat[k], `${lang}: ${k}`);
  }
});
