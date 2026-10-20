import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function ProjectSeoPage({params}: {params: Promise<{id: string}>}) { const {id} = await params; await requireDashboardPagePermission("campaigns"); return <ContentEditor kind="campaigns" id={id} />; }
