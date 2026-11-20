import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p: string) => fs.readFileSync(p, "utf8");
const NEW = "/dashboard/communication/conversations";

test("the top-bar WhatsApp icon opens the conversations page and counts its unread", () => {
  assert.ok(read("app/(dashboard)/dashboard/_shell/DashboardTopbar.tsx").includes(`<Link href="${NEW}"`));
  const layout = read("app/(dashboard)/dashboard/DashboardLayoutClient.tsx");
  assert.match(layout, /inbox\/conversations\?countsOnly=1/);
  assert.match(layout, /Number\(data\?\.counts\?\.all\)/);
  assert.match(read("app/api/dashboard/communication/inbox/conversations/route.ts"), /countsOnly \? Promise\.resolve\(\[\]\)/);
  assert.match(read("app/(dashboard)/dashboard/communication/conversations/_components/ConversationsWorkspace.tsx"), /dispatchEvent\(new Event\("whatsapp-inbox-updated"\)\)/);
});

test("voice notes keep working: the microphone is allowed on the conversations page", () => {
  const cfg = read("next.config.ts");
  for (const path of [NEW, "/dashboard/communication/inbox"]) {
    assert.match(cfg, new RegExp(`source: "${path.replace(/\//g, "\\/")}\\/:path\\*",\\s*\\n\\s*headers: \\[[^\\n]*microphone=\\(self\\)`), path);
  }
  const boundary = read("components/dashboard/InboxPermissionsBoundary.tsx");
  assert.ok(boundary.includes(`path === "${NEW}"`), "the conversations page");
  assert.ok(boundary.includes(`path === "/dashboard/communication/inbox"`), "and the old address, which redirects there");
});

test("the old inbox address redirects, and the sidebar no longer lists the page", () => {
  assert.match(read("app/(dashboard)/dashboard/communication/inbox/page.tsx"), new RegExp(`redirect\\("${NEW}"\\)`));
  assert.ok(!read("lib/dashboard/nav-config.ts").includes(`href: "${NEW}"`));
});
