import assert from "node:assert/strict";
import test from "node:test";
import { buildBreadcrumbs } from "../../lib/dashboard/breadcrumbs";

test("unified content editors link back to the real collection rather than technical route folders", () => {
  for (const kind of ["blog", "campaigns", "categories", "super-categories", "urgent-banners", "videos", "playlists", "courses", "reports", "booklets", "faqs"]) {
    const crumbs = buildBreadcrumbs(`/dashboard/content/${kind}/6ab017836bda310f6a1f70fc`);
    assert.deepEqual(crumbs.filter(crumb => crumb.href).map(crumb => crumb.href), ["/dashboard", `/dashboard/${kind}`]);
    assert.equal(crumbs.at(-1)?.label, "تعديل");
  }
});
test("edit and unknown ancestor directories never become broken breadcrumb links", () => {
  assert.deepEqual(buildBreadcrumbs("/dashboard/campaigns/edit/6ab017836bda310f6a1f70fc").filter(crumb => crumb.href).map(crumb => crumb.href), ["/dashboard", "/dashboard/campaigns"]);
  assert.deepEqual(buildBreadcrumbs("/dashboard/unknown/section/record").filter(crumb => crumb.href).map(crumb => crumb.href), ["/dashboard"]);
});
test("breadcrumbs respect collection visibility and never expose a hidden editor parent", () => {
  const crumbs = buildBreadcrumbs("/dashboard/content/blog/6ab017836bda310f6a1f70fc", ["/dashboard", "/dashboard/campaigns"]);
  assert.deepEqual(crumbs.filter(crumb => crumb.href).map(crumb => crumb.href), ["/dashboard"]);
  assert.equal(buildBreadcrumbs("/dashboard")[0].href, undefined);
});
