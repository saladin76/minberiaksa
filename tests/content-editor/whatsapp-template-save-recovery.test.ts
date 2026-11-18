import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/templates/whatsapp/route.ts", "utf8");
const dialog = fs.readFileSync("app/(dashboard)/dashboard/templates/_components/WhatsappTemplateEditorDialog.tsx", "utf8");

test("creating a WhatsApp template refuses a duplicate name before creating or publishing to Meta", () => {
  const post = route.slice(route.indexOf("export async function POST"));
  const guard = post.indexOf('code: "WHATSAPP_TEMPLATE_NAME_EXISTS"');
  assert.ok(guard > 0, "duplicate-name guard missing");
  assert.ok(guard < post.indexOf("prisma.whatsappTemplate.create("), "guard must run before create");
  assert.ok(guard < post.indexOf("publishWhatsappTemplateToMeta("), "guard must run before the Meta publish");
  assert.match(post, /status: 409/);
});

test("template dialog treats a lost or gateway-timeout response as unconfirmed, not failed", () => {
  assert.match(dialog, /\[502, 503, 504\]\.includes\(status \?\? 0\)/);
  assert.match(dialog, /axios\.get\("\/api\/templates\/whatsapp"\)/);
  assert.match(dialog, /row\.name === name/);
  assert.match(dialog, /data\?\.code === "WHATSAPP_TEMPLATE_NAME_EXISTS"/);
});
