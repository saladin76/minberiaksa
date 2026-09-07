import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DASHBOARD_NAV_GROUPS,
  DASHBOARD_NAV_HREFS_ORDERED,
  resolveActiveDashboardHref,
} from "../../lib/dashboard/nav-config";
import { DASHBOARD_PERMISSION_KEYS } from "../../lib/dashboard/permissions";

const read = (path: string) => readFileSync(path, "utf8");

test("brand is absent from dashboard navigation and visible permissions", () => {
  assert.equal(DASHBOARD_NAV_GROUPS.some((group) => group.group === "الهوية"), false);
  assert.equal(DASHBOARD_NAV_HREFS_ORDERED.some((href) => href.startsWith("/dashboard/brand")), false);
  assert.equal((DASHBOARD_PERMISSION_KEYS as readonly string[]).includes("brand"), false);
});

test("active navigation resolves one longest matching route", () => {
  // Sample routes only — this exercises the longest-prefix logic, not the routes themselves.
  // Switched off /dashboard/operations now that it is gone, so the fixture cannot be mistaken
  // for a claim that those pages still exist.
  const hrefs = [
    "/dashboard",
    "/dashboard/platform-connections",
    "/dashboard/platform-connections/communication",
  ];
  assert.equal(
    resolveActiveDashboardHref("/dashboard/platform-connections/communication/senders", hrefs),
    "/dashboard/platform-connections/communication",
  );
  assert.equal(resolveActiveDashboardHref("/dashboard", hrefs), "/dashboard");
  assert.equal(resolveActiveDashboardHref("/dashboard-other", hrefs), null);
});

test("legacy brand asset and framework routes redirect directly", () => {
  const directRedirects: Record<string, string> = {
    "app/(dashboard)/dashboard/brand/assets/page.tsx": "/dashboard/archive/assets?source=legacy-brand",
    "app/(dashboard)/dashboard/brand/downloads/page.tsx": "/dashboard/archive/assets?source=legacy-brand",
    // Both used to land on the operations communication templates page. That page went with
    // التشغيل, so they now redirect to the surviving template editor.
    "app/(dashboard)/dashboard/brand/frameworks/page.tsx": "/dashboard/templates",
    "app/(dashboard)/dashboard/brand/message-templates/page.tsx": "/dashboard/templates",
  };

  for (const [path, destination] of Object.entries(directRedirects)) {
    const source = read(path);
    assert.ok(source.includes(`redirect("${destination}")`), `${path} must redirect directly to ${destination}`);
  }
});

test("legacy brand overview routes use a permission-aware fallback", () => {
  for (const path of [
    "app/(dashboard)/dashboard/brand/page.tsx",
    "app/(dashboard)/dashboard/brand/center/page.tsx",
    "app/(dashboard)/dashboard/brand/colors/page.tsx",
    "app/(dashboard)/dashboard/brand/typography/page.tsx",
    "app/(dashboard)/dashboard/brand/fonts/page.tsx",
    "app/(dashboard)/dashboard/brand/voice/page.tsx",
    "app/(dashboard)/dashboard/brand/tone/page.tsx",
    "app/(dashboard)/dashboard/brand/organizations/page.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /resolveDashboardFallbackHref/);
    assert.match(source, /getServerSession/);
  }
});

test("brand management interfaces and exclusive APIs are removed", () => {
  for (const path of [
    "app/(dashboard)/dashboard/brand/_components/BrandCenterView.tsx",
    "app/(dashboard)/dashboard/brand/_components/BrandAssetCreatePanel.tsx",
    "app/(dashboard)/dashboard/brand/_components/BrandColorCreatePanel.tsx",
    "app/(dashboard)/dashboard/brand/_components/BrandFontCreatePanel.tsx",
    "app/(dashboard)/dashboard/brand/_components/BrandGuidelineCreatePanel.tsx",
    "app/(dashboard)/dashboard/brand/_components/BrandMessageFrameworkCreatePanel.tsx",
    "app/api/admin/brand/assets/route.ts",
    "app/api/admin/brand/colors/route.ts",
    "app/api/admin/brand/fonts/route.ts",
    "app/api/admin/brand/guidelines/route.ts",
    "app/api/admin/brand/frameworks/route.ts",
    "app/api/admin/brand/overview/route.ts",
    "app/api/admin/brand/ai/route.ts",
    "app/api/admin/archive/assets/[id]/add-to-brand-assets/route.ts",
  ]) {
    assert.equal(existsSync(path), false, `${path} must be removed`);
  }
});

test("legacy assets are exposed read-only in their new home", () => {
  const assets = read("app/(dashboard)/dashboard/archive/assets/page.tsx");
  assert.match(assets, /linkedLegacyAssets/);
  assert.match(assets, /Boolean\(asset\.fileUrl\)/);
  assert.match(assets, /LEGACY_BRAND/);

  // The frameworks half read the operations communication templates page, which no longer
  // exists — readFileSync on it throws rather than failing an assertion.
});
