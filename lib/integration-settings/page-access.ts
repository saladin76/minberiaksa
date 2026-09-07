import type { Session } from "next-auth";
import {
  getFirstAllowedDashboardHref,
  userHasDashboardPermission,
} from "../dashboard/permissions";
import {
  DASHBOARD_NAV_HREFS_ORDERED,
  dashboardHrefToPermissionKey,
} from "../dashboard/nav-config";

export type AuthenticatedDashboardSession = Session & {
  user: NonNullable<Session["user"]>;
};

export type CommunicationConnectionsPageAccess =
  | { allowed: true; session: AuthenticatedDashboardSession }
  | { allowed: false; redirectTo: string };

export function resolveCommunicationConnectionsPageAccess(
  session: Session | null,
): CommunicationConnectionsPageAccess {
  const user = session?.user;

  if (!user) {
    return { allowed: false, redirectTo: "/ar/auth/signin" };
  }

  if (!userHasDashboardPermission(user, "platformConnections")) {
    const fallback = getFirstAllowedDashboardHref(
      user,
      DASHBOARD_NAV_HREFS_ORDERED,
      dashboardHrefToPermissionKey,
    );
    return { allowed: false, redirectTo: fallback ?? "/" };
  }

  return { allowed: true, session: { ...session, user } };
}
