import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";

export const dynamic = "force-dynamic";

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboardPagePermission("blog");
  return <><ContentSuiteNavigation />{children}</>;
}
