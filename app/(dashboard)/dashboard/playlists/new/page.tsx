import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
import { CONFIG } from "@/lib/content-editor/contracts";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function Page() { await requireDashboardPagePermission(CONFIG["playlists"].permission); return <ContentEditor kind="playlists" id="new" />; }
