import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
import { CONFIG } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function Page() { await requireDashboardPagePermission(CONFIG["categories"].permission); return <ContentEditor kind="categories" id="new" />; }
