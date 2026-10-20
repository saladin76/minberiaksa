import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { CONFIG } from "@/lib/content-editor/contracts";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function EditContentPage({params}: {params: Promise<{id: string}>}) {
 const {id} = await params; await requireDashboardPagePermission(CONFIG["urgent-banners"].permission);
 return <ContentEditor kind="urgent-banners" id={id} />;
}
