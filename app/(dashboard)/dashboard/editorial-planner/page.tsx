import { requireDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { EditorialPlanner } from "@/components/dashboard/content-editor/EditorialPlanner";
export default async function Page({ searchParams }: { searchParams: Promise<{ improve?: string }> }) {
  await requireDashboardPagePermission("blog");
  const { improve } = await searchParams;
  return <EditorialPlanner initialArticleId={improve && /^[a-f0-9]{24}$/i.test(improve) ? improve : ""} />;
}
