import type { Session } from "next-auth";
import type { DashboardPermissionKey } from "./permissions";
import {
  resolveDashboardPageAccess,
  type AuthenticatedDashboardSession,
} from "./page-access";

export type DashboardPageSessionProvider = () => Promise<Session | null>;
export type DashboardPageRedirect = (redirectTo: string) => never;
export type DashboardPagePermissionGuard = (
  permission: DashboardPermissionKey,
) => Promise<AuthenticatedDashboardSession>;

export function createDashboardPagePermissionGuard(
  getSession: DashboardPageSessionProvider,
  deny: DashboardPageRedirect,
): DashboardPagePermissionGuard {
  return async function requireDashboardPagePermission(permission) {
    const access = resolveDashboardPageAccess(await getSession(), permission);
    if (!access.allowed) return deny(access.redirectTo);
    return access.session;
  };
}

export function createDashboardPageDataLoader(
  requirePermission: DashboardPagePermissionGuard,
) {
  return async function loadDashboardPageData<T>(
    permission: DashboardPermissionKey,
    loader: (session: AuthenticatedDashboardSession) => Promise<T>,
  ): Promise<T> {
    const session = await requirePermission(permission);
    return loader(session);
  };
}
