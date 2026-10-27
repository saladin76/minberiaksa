import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { GoogleSearchManager } from "./GoogleSearchManager";
export default async function GoogleSearchPage() {
  await requireDashboardPagePermission("platformConnections");
  return <GoogleSearchManager />;
}
