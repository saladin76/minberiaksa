import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const yedi = JSON.parse(readFileSync("package.json", "utf8")).name === "yedicihan";
const file = (p: string) => readFileSync(p, "utf8");
test("security dashboard exposes a maintenance control", () => {
  const path = yedi ? "app/(dashboard)/dashboard/security/page.tsx" :
    "app/(dashboard)/dashboard/security/SiteSecurityManager.tsx";
  assert.match(file(path), /<EmergencyMaintenanceControl\s*\/>/);
});
test("emergency control uses administrator API, explicit confirmation and revision", () => {
  const ui = file("app/(dashboard)/dashboard/security/EmergencyMaintenanceControl.tsx");
  const api = file("app/api/admin/site-security/maintenance/route.ts");
  assert.match(ui, /expectedRevision: status\.revision/);
  assert.match(ui, /window\.confirm/);
  assert.match(api, /requireAdminSession\(session\)/);
  assert.match(api, /INVALID_REQUEST_ORIGIN/);
  assert.match(api, /MAINTENANCE_STALE_REVISION/);
});
test("maintenance gates public requests and exempts signed payment callbacks", () => {
  const content = yedi ? file("proxy.ts") : file("lib/site-security/request.ts");
  assert.match(content, /readEmergencyMaintenance/);
  assert.match(content, /SITE_UNDER_MAINTENANCE/);
  assert.match(content, /Retry-After/);
  if (yedi) {
    assert.ok(content.includes("stripe"), "Stripe callback must be exempt");
    assert.match(content, /admin\|auth\|cron\|webhooks/);
  } else {
    assert.match(content, /isSecurityExemptPath/);
  }
});
test("maintenance database uses atomic revision updates and no automatic activation", () => {
  const content = file("lib/site-security/emergency-maintenance.ts");
  assert.match(content, /findAndModify/);
  assert.match(content, /revision: prior\.revision/);
  assert.match(content, /enabled: false, revision: 0/);
});
