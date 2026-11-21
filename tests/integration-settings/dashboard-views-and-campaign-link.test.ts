import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const page = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const wizard = fs.readFileSync("app/(dashboard)/dashboard/communication/campaigns/new/_components/NewCampaignWizard.tsx", "utf8");
const api = fs.readFileSync("app/api/admin/dashboard-views/route.ts", "utf8");
test("saved views: own or shared, author-only delete, revenue permission, only known filter keys", () => {
  assert.match(api, /\$or: \[\{ ownerId: me \}, \{ shared: true \}\]/);
  assert.match(api, /q: \{ _id: \{ \$oid: id \}, ownerId: session\?\.user\?\.id \?\? "" \}/);
  assert.match(api, /requireAdminOrDashboardPermission\(session, "revenue"\)/);
  assert.match(api, /KEYS\.filter\(\(k\) => typeof raw\[k\] === "string"\)/);
});
test("campaign for this result carries matching filters, lists the rest, and the wizard fills its smart audience", () => {
  assert.match(page, /campaigns\/new\?audience=/);
  assert.match(page, /dropped\.push\(dt\("بوابة الدفع"\)\)/);
  assert.match(wizard, /new URLSearchParams\(window\.location\.search\)\.get\("audience"\)/);
  assert.match(wizard, /لم تُنقل/);
});
