import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { PageSeoEditor } from "@/components/dashboard/content-editor/PageSeoEditor";
export default async function Page() { await requireDashboardPagePermission("siteContent"); return <PageSeoEditor />; }
