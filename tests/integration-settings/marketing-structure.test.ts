import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Session } from "next-auth";
import { resolveDashboardPageAccess } from "../../lib/dashboard/page-access";
import { DASHBOARD_NAV_GROUPS } from "../../lib/dashboard/nav-config";
import { pathToDashboardPermission } from "../../lib/dashboard/permissions";

function sessionFor(permissions: string[]): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "marketing-test-user",
      name: "Marketing Test",
      email: "marketing@example.org",
      role: "STAFF",
      dashboardPermissions: permissions,
    },
  } as Session;
}

test("marketing navigation exposes exactly the two approved pages", () => {
  const marketing = DASHBOARD_NAV_GROUPS.find((group) => group.group === "التسويق");
  assert.ok(marketing);
  assert.deepEqual(marketing.items.map((item) => item.href), [
    "/dashboard/marketing/attribution",
    "/dashboard/marketing/tracking",
  ]);
});

test("marketing routes preserve independent permission boundaries", () => {
  assert.equal(pathToDashboardPermission("/dashboard/marketing/attribution"), "referrals");
  assert.equal(pathToDashboardPermission("/dashboard/marketing/tracking"), "pixels");
  // Anything else under /dashboard/marketing still falls back to `ads`.
  assert.equal(pathToDashboardPermission("/dashboard/marketing"), "ads");
});

test("generic server guard rejects unauthenticated and unauthorized users", () => {
  assert.deepEqual(resolveDashboardPageAccess(null, "ads"), {
    allowed: false,
    redirectTo: "/ar/auth/signin",
  });
  const denied = resolveDashboardPageAccess(sessionFor(["referrals"]), "ads");
  assert.equal(denied.allowed, false);
  const allowed = resolveDashboardPageAccess(sessionFor(["ads"]), "ads");
  assert.equal(allowed.allowed, true);
});

test("server pages guard before protected reads", () => {
  // The marketing overview/performance/recommendations pages and the platform-connections
  // overview were removed; only pages that still exist can be asserted on here.
  const cases = [
    ["app/(dashboard)/dashboard/platform-connections/health/page.tsx", "integrationActorFromSession(session)"],
  ] as const;

  for (const [path, protectedRead] of cases) {
    const source = readFileSync(path, "utf8");
    const guard = source.indexOf("resolveDashboardPageAccess");
    const redirect = source.indexOf("redirect(access.redirectTo)");
    const read = source.indexOf(protectedRead);
    assert.ok(guard >= 0, `${path} must contain a server guard`);
    assert.ok(redirect > guard, `${path} must redirect denied users`);
    assert.ok(read > redirect, `${path} must not read protected data before redirect`);
    assert.doesNotMatch(source, /session!/);
  }
});

test("legacy marketing routes have explicit redirects", () => {
  const config = readFileSync("next.config.ts", "utf8");
  for (const legacy of [
    "/dashboard/marketing/results",
    "/dashboard/marketing/insights",
    "/dashboard/marketing/data-sync",
    "/dashboard/marketing-intelligence/executive-overview",
    "/dashboard/marketing-intelligence/conversion-value-audit",
    "/dashboard/marketing-intelligence/platform-status",
    "/dashboard/marketing-intelligence/repair-center",
  ]) {
    assert.match(config, new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
