import { requireAnyDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { ContentStrategyWorkspace } from "./ContentStrategyWorkspace";

export async function ContentStrategyPage({ initialTab = "seo", initialArticleId = "" }: { initialTab?: "seo" | "editorial"; initialArticleId?: string }) {
  const session = await requireAnyDashboardPagePermission(["siteContent", "blog"]);
  return <ContentStrategyWorkspace initialTab={initialTab} initialArticleId={/^[a-f0-9]{24}$/i.test(initialArticleId) ? initialArticleId : ""} canSeo={userHasDashboardPermission(session.user, "siteContent")} canEditorial={userHasDashboardPermission(session.user, "blog")} />;
}
