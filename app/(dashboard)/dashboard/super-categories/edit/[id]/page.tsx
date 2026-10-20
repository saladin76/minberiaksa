import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { CONFIG } from "@/lib/content-editor/contracts";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function EditContentPage({params}: {params: Promise<{id: string}>}) {
 const {id} = await params; await requireDashboardPagePermission(CONFIG["super-categories"].permission);
 return <ContentEditor kind="super-categories" id={id} />;
}
