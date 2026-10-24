import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
import { CONFIG } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function Page() { await requireDashboardPagePermission(CONFIG["videos"].permission); return <ContentEditor kind="videos" id="new" />; }
