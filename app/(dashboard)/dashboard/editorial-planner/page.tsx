import { ContentStrategyPage } from "@/components/dashboard/content-editor/ContentStrategyPage";
export default async function Page({ searchParams }: { searchParams: Promise<{ improve?: string }> }) {
  const { improve } = await searchParams;
  return <ContentStrategyPage initialTab="editorial" initialArticleId={improve || ""} />;
}
