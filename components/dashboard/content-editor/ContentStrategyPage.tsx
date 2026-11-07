import { requireAnyDashboardPagePermission } from "@/lib/dashboard/require-page-permission";
import { userHasDashboardPermission } from "@/lib/dashboard/permissions";
import { CONFIG } from "@/lib/content-editor/contracts";
import { READINESS_KINDS } from "@/lib/content-editor/readiness";
import { ContentStrategyWorkspace } from "./ContentStrategyWorkspace";

export async function ContentStrategyPage({ initialTab = "seo", initialArticleId = "" }: { initialTab?: "seo" | "editorial" | "translations"; initialArticleId?: string }) {
  const session = await requireAnyDashboardPagePermission(["siteContent", "blog", "campaigns", "categories"]);
  return <ContentStrategyWorkspace allowedKinds={READINESS_KINDS.filter(kind => userHasDashboardPermission(session.user, CONFIG[kind].permission))} initialTab={initialTab} initialArticleId={/^[a-f0-9]{24}$/i.test(initialArticleId) ? initialArticleId : ""} canSeo={userHasDashboardPermission(session.user, "siteContent")} canEditorial={userHasDashboardPermission(session.user, "blog")} />;
}
