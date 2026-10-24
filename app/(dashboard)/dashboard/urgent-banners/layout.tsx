import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentSuiteNavigation } from "@/components/dashboard/content-editor/ContentSuiteNavigation";
export default async function ContentSectionLayout({children}: {children: React.ReactNode}) { await requireDashboardPagePermission("siteContent"); return <><ContentSuiteNavigation />{children}</>; }
