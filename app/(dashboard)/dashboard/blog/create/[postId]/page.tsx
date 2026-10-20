import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
export default async function EditArticle({params}: {params: Promise<{postId: string}>}) { const {postId} = await params; await requireDashboardPagePermission("blog"); return <ContentEditor kind="blog" id={postId} />; }
