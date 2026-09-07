import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";

export const dynamic = "force-dynamic";

export default async function CategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardPagePermission("categories");
  return children;
}
