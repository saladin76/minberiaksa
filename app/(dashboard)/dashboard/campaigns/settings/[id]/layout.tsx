import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { CONFIG } from "@/lib/content-editor/contracts";
import { readContent } from "@/lib/content-editor/service";
import { contentStore } from "@/lib/content-editor/store";
import { SettingsWriteGuard } from "@/components/dashboard/content-editor/SettingsWriteGuard";
export default async function SettingsLayout({children,params}: {children: React.ReactNode; params: Promise<{id: string}>}) {
 const {id} = await params; await requireDashboardPagePermission(CONFIG["campaigns"].permission);
 const row = await readContent(contentStore, "campaigns", id);
 return <SettingsWriteGuard endpoint={`/api/campaigns/${id}`} version={typeof row.editorVersion === "string" ? row.editorVersion : null}>{children}</SettingsWriteGuard>;
}
