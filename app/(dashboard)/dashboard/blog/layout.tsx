import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";

export const dynamic = "force-dynamic";

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardPagePermission("blog");
  return children;
}
