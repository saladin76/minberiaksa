import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { CONFIG } from "@/lib/content-editor/contracts";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function EditContentPage({params}: {params: Promise<{id: string}>}) {
 const {id} = await params; await requireDashboardPagePermission(CONFIG["campaigns"].permission);
 return <ContentEditor kind="campaigns" id={id} />;
}
