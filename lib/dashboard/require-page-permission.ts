import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { createDashboardPageDataLoader, createDashboardPagePermissionGuard } from "./page-permission";

const getCachedDashboardSession = cache(() => getServerSession(authOptions));

export const requireDashboardPagePermission = createDashboardPagePermissionGuard(
  getCachedDashboardSession,
  redirect,
);

export const loadDashboardPageData = createDashboardPageDataLoader(
  requireDashboardPagePermission,
);
