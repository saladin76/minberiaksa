import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function ContentSectionLayout({children}: {children: React.ReactNode}) { await requireDashboardPagePermission("siteContent"); return children; }
