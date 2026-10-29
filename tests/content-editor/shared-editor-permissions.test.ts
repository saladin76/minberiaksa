import test from "node:test";
import assert from "node:assert/strict";
import { pathToDashboardPermission, userCanOpenDashboardPath } from "../../lib/dashboard/permissions";
import { CONFIG, CONTENT_KINDS } from "../../lib/content-editor/contracts";
test("every shared editor route keeps its own section permission for staff", () => {
  for (const kind of CONTENT_KINDS) for (const id of ["new", "111111111111111111111111"])
    assert.equal(pathToDashboardPermission("/dashboard/content/" + kind + "/" + id), CONFIG[kind].permission);
  assert.equal(pathToDashboardPermission("/dashboard/seo-pages"), "siteContent");
  assert.equal(pathToDashboardPermission("/dashboard/editorial-planner"), "blog");
});
test("campaign and category editors can enter the readiness center without accessing unrelated editorial tools", () => {
  for (const permission of ["campaigns", "categories"] as const) {
    const user = { role: "STAFF", dashboardPermissions: [permission] };
    assert.equal(userCanOpenDashboardPath(user, "/dashboard/seo-pages"), true);
    assert.equal(userCanOpenDashboardPath(user, "/dashboard/editorial-planner"), false);
    assert.equal(userCanOpenDashboardPath(user, "/dashboard/content/blog/111111111111111111111111"), false);
  }
  assert.equal(userCanOpenDashboardPath({ role: "STAFF", dashboardPermissions: ["users"] }, "/dashboard/seo-pages"), false);
});
