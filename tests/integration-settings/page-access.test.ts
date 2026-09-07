import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Session } from "next-auth";
import { resolveCommunicationConnectionsPageAccess } from "../../lib/integration-settings/page-access";

function sessionFor(role: "ADMIN" | "STAFF", dashboardPermissions: string[]): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: {
      id: "test-user",
      name: "Test User",
      email: "test@example.org",
      role,
      dashboardPermissions,
    },
  } as Session;
}

test("unauthenticated users are redirected to sign-in before protected data can load", () => {
  const access = resolveCommunicationConnectionsPageAccess(null);
  assert.deepEqual(access, { allowed: false, redirectTo: "/ar/auth/signin" });
});

test("authenticated users without platformConnections are redirected to their first allowed page", () => {
  // Was ["operations"] -> /dashboard/operations/tasks. That permission key and page went with
  // التشغيل; "donors" stands in as any permission that is not platformConnections.
  const access = resolveCommunicationConnectionsPageAccess(
    sessionFor("STAFF", ["donors"]),
  );
  assert.deepEqual(access, {
    allowed: false,
    redirectTo: "/dashboard/users/donors",
  });
});

test("authenticated users without any allowed dashboard page are redirected home", () => {
  const access = resolveCommunicationConnectionsPageAccess(
    sessionFor("STAFF", []),
  );
  assert.deepEqual(access, { allowed: false, redirectTo: "/" });
});

test("authorized users pass the server-side guard", () => {
  const session = sessionFor("STAFF", ["platformConnections"]);
  const access = resolveCommunicationConnectionsPageAccess(session);
  assert.equal(access.allowed, true);
  if (access.allowed) assert.equal(access.session.user.id, "test-user");
});

test("page redirects before actor creation, provider snapshots, or scheduler reads", () => {
  const source = readFileSync(
    "app/(dashboard)/dashboard/platform-connections/communication/page.tsx",
    "utf8",
  );

  const guardIndex = source.indexOf("resolveCommunicationConnectionsPageAccess");
  const redirectIndex = source.indexOf("redirect(access.redirectTo)");
  const actorIndex = source.indexOf("integrationActorFromSession(session)");
  const snapshotIndex = source.indexOf("integrationSettingsService.getProviderSnapshot");
  const schedulerIndex = source.indexOf("getSchedulerStatus()");

  assert.ok(guardIndex >= 0, "server-side access guard must be present");
  assert.ok(redirectIndex > guardIndex, "denied users must be redirected server-side");
  assert.ok(actorIndex > redirectIndex, "actor creation must happen after the redirect guard");
  assert.ok(snapshotIndex > redirectIndex, "provider snapshots must load after the redirect guard");
  assert.ok(schedulerIndex > redirectIndex, "scheduler state must load after the redirect guard");
  assert.doesNotMatch(source, /integrationActorFromSession\(session!\)/);
});
