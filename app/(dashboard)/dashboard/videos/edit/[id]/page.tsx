import { ContentEditor } from "@/components/dashboard/content-editor/ContentEditor";
import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireDashboardPagePermission("siteContent");
  const { id } = await params;
  return <ContentEditor kind="videos" id={id} />;
}
