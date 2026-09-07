import test from "node:test";
import assert from "node:assert/strict";
import { userHasDashboardPermission } from "../../lib/dashboard/permissions";
const staff = (dashboardPermissions: string[]) => ({ role: "STAFF", dashboardPermissions });

test("view permission cannot test, modify, or disable", () => {
  const user = staff(["platformConnections"]);
  assert.equal(userHasDashboardPermission(user, "platformConnections"), true);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsTest"), false);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsManage"), false);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsAdmin"), false);
});

test("manage permission inherits view and test but not admin", () => {
  const user = staff(["platformConnectionsManage"]);
  assert.equal(userHasDashboardPermission(user, "platformConnections"), true);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsTest"), true);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsManage"), true);
  assert.equal(userHasDashboardPermission(user, "platformConnectionsAdmin"), false);
});

test("ADMIN role passes server-side integration checks", () => {
  assert.equal(userHasDashboardPermission({ role: "ADMIN", dashboardPermissions: [] }, "platformConnectionsAdmin"), true);
});
