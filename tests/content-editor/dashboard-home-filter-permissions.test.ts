import assert from "node:assert/strict";
import test from "node:test";
import { userHasDashboardPermission } from "../../lib/dashboard/permissions";

test("revenue-only staff can read dashboard data without campaigns management", () => {
  const user={role:"STAFF",dashboardPermissions:["revenue"]};
  assert.equal(userHasDashboardPermission(user,"revenue"),true);
  assert.equal(userHasDashboardPermission(user,"campaigns"),false);
});

test("unprivileged staff, donor and anonymous cannot read revenue dashboard", () => {
  for (const user of [
    {role:"STAFF",dashboardPermissions:["campaigns"]},
    {role:"DONOR",dashboardPermissions:["revenue"]},
    {role:null,dashboardPermissions:["revenue"]},
  ]) assert.equal(userHasDashboardPermission(user,"revenue"),false);
});

test("admins retain revenue and campaign management permissions", () => {
  const admin={role:"ADMIN",dashboardPermissions:[]};
  assert.equal(userHasDashboardPermission(admin,"revenue"),true);
  assert.equal(userHasDashboardPermission(admin,"campaigns"),true);
});
