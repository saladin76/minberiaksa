import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { CONFIG } from "@/lib/content-editor/contracts";
import { readContent } from "@/lib/content-editor/service";
import { contentStore } from "@/lib/content-editor/store";
import { SettingsWriteGuard } from "@/components/dashboard/content-editor/SettingsWriteGuard";
export default async function SettingsLayout({children,params}: {children: React.ReactNode; params: Promise<{id: string}>}) {
 const {id} = await params; await requireDashboardPagePermission(CONFIG["urgent-banners"].permission);
 const row = await readContent(contentStore, "urgent-banners", id);
 return <SettingsWriteGuard endpoint={`/api/urgent-banners/${id}`} version={typeof row.editorVersion === "string" ? row.editorVersion : null}>{children}</SettingsWriteGuard>;
}
