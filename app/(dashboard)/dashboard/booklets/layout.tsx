import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";

export default async function ContentSectionLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardPagePermission("siteContent");
  return <><ContentSuiteNavigation />{children}</>;
}
