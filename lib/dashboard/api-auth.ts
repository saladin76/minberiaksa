import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import {
  type DashboardPermissionKey,
  sessionHasDashboardPermission,
  userHasDashboardPermission,
} from "./permissions";

/**
 * Admin-only actions (role / permission assignment, destructive ops).
 * STAFF never passes this.
 */
export function requireAdminSession(session: Session | null): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** ADMIN always allowed; STAFF allowed if they have the section permission */
export function requireAdminOrDashboardPermission(
  session: Session | null,
  permission: DashboardPermissionKey
): NextResponse | null {
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionHasDashboardPermission(session, permission)) {
    return null;
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** For routes that used "isAdmin" for donor-wide views (e.g. donations list) */
export function isRevenueDashboardUser(session: Session | null): boolean {
  return userHasDashboardPermission(session?.user, "revenue");
}
