import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { createDashboardPageDataLoader, createDashboardPagePermissionGuard } from "./page-permission";
import { userHasDashboardPermission, type DashboardPermissionKey } from "./permissions";

const getCachedDashboardSession = cache(() => getServerSession(authOptions));

export const requireDashboardPagePermission = createDashboardPagePermissionGuard(
  getCachedDashboardSession,
  redirect,
);

/** Container access only; each embedded tool still checks its own permission. */
export async function requireAnyDashboardPagePermission(keys: [DashboardPermissionKey, ...DashboardPermissionKey[]]) {
  const session = await getCachedDashboardSession();
  return requireDashboardPagePermission(keys.find(key => userHasDashboardPermission(session?.user, key)) || keys[0]);
}

export const loadDashboardPageData = createDashboardPageDataLoader(
  requireDashboardPagePermission,
);
