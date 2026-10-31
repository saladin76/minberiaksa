import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { GoogleSearchManager } from "./GoogleSearchManager";
export default async function GoogleSearchPage() {
  const session = await requireDashboardPagePermission("platformConnections");
  return <GoogleSearchManager canManage={userHasDashboardPermission(session.user, "platformConnectionsManage")} canTest={userHasDashboardPermission(session.user, "platformConnectionsTest")} />;
}
