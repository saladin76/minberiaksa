import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
import { CONFIG } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function Page() { await requireDashboardPagePermission(CONFIG["campaigns"].permission); return <ContentEditor kind="campaigns" id="new" />; }
