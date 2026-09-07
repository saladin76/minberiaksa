import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  getFirstAllowedDashboardHref,
  userHasDashboardPermission,
} from "@/lib/dashboard/permissions";
import {
  DASHBOARD_NAV_HREFS_ORDERED,
  dashboardHrefToPermissionKey,
} from "@/lib/dashboard/nav-config";

export default async function UsersIndexPage() {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (userHasDashboardPermission(u, "donors")) {
    redirect("/dashboard/users/donors");
  }
  if (userHasDashboardPermission(u, "team")) {
    redirect("/dashboard/users/team");
  }
  const next = getFirstAllowedDashboardHref(
    u,
    DASHBOARD_NAV_HREFS_ORDERED,
    dashboardHrefToPermissionKey
  );
  redirect(next ?? "/");
}
