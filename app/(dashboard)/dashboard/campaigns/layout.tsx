import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";

export const dynamic = "force-dynamic";

export default async function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardPagePermission("campaigns");
  return children;
}
