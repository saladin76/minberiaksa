import test from "node:test";
import assert from "node:assert/strict";
import { pathToDashboardPermission } from "../../lib/dashboard/permissions";
import { CONFIG, CONTENT_KINDS } from "../../lib/content-editor/contracts";
test("every shared editor route keeps its own section permission for staff", () => {
  for (const kind of CONTENT_KINDS) for (const id of ["new", "111111111111111111111111"])
    assert.equal(pathToDashboardPermission("/dashboard/content/" + kind + "/" + id), CONFIG[kind].permission);
  assert.equal(pathToDashboardPermission("/dashboard/seo-pages"), "siteContent");
  assert.equal(pathToDashboardPermission("/dashboard/editorial-planner"), "blog");
});
